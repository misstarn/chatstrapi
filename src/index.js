// 'use strict';

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) { },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap({ strapi }) {

    const { createServer, get } = require("http");
    const { Server } = require("socket.io");

    const httpServer = createServer();
    const io = new Server(httpServer, {
      // options
      cors: {
        origin: "http://localhost:3000",
        // or with an array of origins
        // origin: ["https://my-frontend.com", "https://my-other-frontend.com", "http://localhost:3000"],
        // credentials: true
      }
    });


    // // 用户列表Map
    const userSocketMap = {}
    let userInfo = {}

    // 连接
    io.on("connection", (socket) => {
      // console.log(socket.id)
      // console.log('a user connected');
      const userFilter = ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description']

      // 断开连接
      socket.on('disconnect', async () => {
        // console.log('user disconnected');
        // 账号下线
        if (socket.user) {

          const entry = await strapi.entityService.update('plugin::users-permissions.user', socket.user.id, {
            data: {
              online: false,
            },
            fields: userFilter,
          });

          // console.log(entry)

          io.emit('offline', socket.user.username)

        }
      });

      socket.join(socket.id)

      // 获取未读消息数
      async function getunReadMessage(sender, receiver) {
        const count = await strapi.db.query("api::message.message").count({
          where: {
            sender: {
              id: sender.id
            },
            receiver: {
              id: receiver.id
            },
            isRead: false
          }
        })

        return count
      }

      //  设置用户
      socket.on('setUsername', async (user) => {
        let userId = null
        if (user) {
          userId = user.id
          socket.user = user
        }
        if (socket.user) {

          // 设置账号在线状态,返回账号更新后的信息
          const entry = await strapi.entityService.update('plugin::users-permissions.user', userId, {
            data: {
              online: true,
            },
            populate: {
              avatar: {
                fields: ['url']
              }
            },
            fields: userFilter,
          });

          // console.log(entry)

          if (entry) {
            // 更新之后返回该用户的群组信息
            io.emit('online', {
              username: entry.username
            })

            socket.user = entry

            io.to(socket.id).emit('userInfo', entry)
          }

          // 添加用户到列表
          userSocketMap[user.username] = socket.id

        }

      })

      // 获取好友组和好友
      socket.on('getUsers', async () => {
        if (socket.user) {
          await getUsers(socket.user)
        }
      })

      // 获取好友组和好友
      const getUsers = async (user) => {
        // 获取用户组
        const userGroups = await strapi.entityService.findMany('api::user-group.user-group', {
          filters: {
            create_by: {
              id: user.id
            },
          },
          populate: {
            user_group_members: {
              filters: {
                status: 'accepted',  //状态为已同意状态好友关系
                friendship: {
                  $not: true
                }
              },
              populate: {
                friendship: true,
                user: {
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                }
              }
            }
          },
          sort: { createdAt: 'ASC' },
        });

        // 返回用户列表 用户组和用户
        const targetSocketId = userSocketMap[user.username]
        io.to(targetSocketId).emit("userGroup", userGroups);
      }

      // 获取群聊列表
      socket.on('getGroups', async () => {
        if (socket.user) {
          // 获取群组
          await getGroups(socket.user)
        }
      })

      // 获取群组列表
      const getGroups = async (user) => {
        const groups = await strapi.entityService.findMany('api::group-member.group-member', {
          filters: {
            user: {
              id: user.id
            },
            status: 'accepted'
          },
          populate: {
            group: {
              populate: {
                create_by: {
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                },
                group_members: {
                  filters: {
                    status: 'accepted'
                  },
                  populate: {
                    user: {
                      populate: {
                        avatar: {
                          fields: ['url']
                        }
                      }
                    }
                  }
                },
                groupAvatar: {
                  fields: ['url']
                }
              }
            }
          }
        })

        // console.log(groups, '123')

        groups.forEach(g => {
          socket.join(g.group.uid)
        });

        const targetSocketId = userSocketMap[user.username]

        io.to(targetSocketId).emit('groups', groups)
      }

      // 加入群聊
      socket.on('joinRoom', (roomName) => {
        // console.log(roomName, '666')
        socket.join(roomName)
      })

      // 离开群聊
      socket.on('leaveRoom', (roomName) => {
        // console.log(roomName, '666')
        // socket.leave(roomName)
      })

      // 接收私聊
      socket.on('privateMessage', ({ targetUser, message, type, fileName, fileId, key, iv }) => {
        if (socket.user) {
          strapi.log.info(key)
          strapi.log.info(targetUser)
          strapi.log.info(message)
          strapi.log.info(userSocketMap[targetUser.username])

          if (targetUser.tab == 'groups') {
            // 存储
            strapi.entityService.create('api::message.message', {
              data: {
                "content": message,
                "sender": socket.user.id,
                "isGroupMessage": true,
                group: targetUser.id,
                type: type,
                jwk_key: key,
                iv: iv,
                fileName: fileName,
                fileId: fileId,
                status: 'accepted',
                group_member: targetUser.group_member,
                gm: `${targetUser.id}${socket.user.id}`,
              },
            }).then(res => {
              // 发给特定房间
              const send = {
                ...targetUser,
                avatar: socket.user.avatar
              }
              // console.log(send, '123')
              send.name = socket.user.name
              socket.to(targetUser.uid).emit('receivePrivateMessage', {
                user: {
                  id: send.id,
                  groupname: send.groupname,
                  name: send.name,
                  uid: send.uid,
                  avatar: send.avatar
                }, me: false, msg: {
                  content: res.content,
                  iv,
                  fileName: res.fileName,
                  isGroupMessage: res.isGroupMessage,
                  jwk_key: res.jwk_key,
                  createdAt: res.createdAt,
                  type
                }
              })
              // 发送给自己
              if (type == 'message') {
                io.to(socket.id).emit('receivePrivateMessage', {
                  user: {
                    id: send.id,
                    uid: send.uid,
                    groupname: send.groupname,
                    name: send.name,
                    avatar: send.avatar
                  }, me: true, msg: {
                    content: res.content,
                    iv,
                    isGroupMessage: res.isGroupMessage,
                    jwk_key: res.jwk_key,
                    fileName: res.fileName,
                    createdAt: res.createdAt,
                    type
                  }
                })
              }
            });


          } else {
            const targetSocketId = userSocketMap[targetUser.username]

            // 并保存到数据库
            strapi.entityService.create('api::message.message', {
              data: {
                "content": message,
                "sender": socket.user.id,
                fs: `${socket.user.id}${targetUser.id}`,
                "receiver": targetUser.id,
                type: type,
                jwk_key: key,
                iv: iv,
                fileId: fileId,
                fileName: fileName,
                status: 'accepted',
                friendship: targetUser.friendship.id,
                "isRead": false
              },
            }).then(res => {
              // 是否在线
              if (targetSocketId && res.id) {
                // 发送到本地 特定用户
                io.to(targetSocketId).emit('receivePrivateMessage', {
                  user: {
                    id: socket.user.id,
                    uid: socket.user.uid,
                    username: socket.user.username,
                    name: socket.user.name,
                    avatar: socket.user.avatar
                  }, me: false, msg: {
                    content: res.content,
                    iv,
                    fileName: res.fileName,
                    isGroupMessage: res.isGroupMessage,
                    createdAt: res.createdAt,
                    type
                  },
                })
              }
              // 发送给自己
              if (type == 'message') {
                io.to(socket.id).emit('receivePrivateMessage', {
                  user: {
                    id: targetUser.id,
                    uid: targetUser.uid,
                    username: targetUser.username,
                    name: targetUser.name,
                    avatar: targetUser.avatar
                  }, me: true, msg: {
                    content: res.content,
                    iv,
                    fileName: res.fileName,
                    isGroupMessage: res.isGroupMessage,
                    createdAt: res.createdAt,
                    type
                  }
                })
              }
            });
          }
        }
      })

      // 获取消息记录
      async function getMsg(targetUser, currentUser, start) {
        // console.log(start)
        // console.log(targetUser, currentUser)
        if (currentUser) {
          if (targetUser.tab == 'friends') {
            const msgs = await strapi.entityService.findMany('api::message.message', {
              filters: {
                friendship: {
                  id: targetUser.friendship.id
                }
              },
              sort: {
                createdAt: 'DESC',
              },
              start: start,
              limit: 15,
              // 查询深度
              populate: {
                sender: {
                  // 显示过滤
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                },
                receiver: {
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                }
              }

            });
            // console.log(msgs)
            return msgs
          } else {
            const msgs = await strapi.entityService.findMany('api::message.message', {
              filters: {
                group: {
                  id: targetUser.id
                },
                isGroupMessage: true
              },
              start: start,
              limit: 15,
              sort: { createdAt: 'DESC' },
              // 查询深度
              populate: {
                sender: {
                  // 显示过滤
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                },
                receiver: {
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                }
              }

            });
            return msgs
          }
        }
      }

      // 获取消息记录
      socket.on('history', async ({ targetUser, currentUser, start }) => {

        // 将未读设为已读
        if (targetUser.tab === 'friends') {
          const entry = await strapi.db.query("api::message.message").updateMany({
            where: {
              fs: `${targetUser.id}${currentUser.id}`,
              isRead: false
            },
            data: {
              isRead: true,
            },
          });

          // console.log(entry)
        }

        const hisotry = await getMsg(targetUser, currentUser, start)


        // 再进行降序排序
        // hisotry.sort((a, b) => {
        //   // 将 createdAt 字段解析为时间戳，然后进行比较
        //   const timeA = new Date(a.createdAt).getTime();
        //   const timeB = new Date(b.createdAt).getTime();

        //   // 降序排序，时间最长的在前面
        //   return timeA - timeB;
        // })


        // console.log(hisotry)
        // 返回消息记录
        io.to(socket.id).emit('historyMsgs', hisotry)

      })

      // 通过关键字查询好友/群 搜索添加
      socket.on('searchUserOrGroup', async (search) => {
        console.log(search)
        // 用户列表
        const users = await findUsers(search)
        // 群列表
        const groups = await findGroups(search)

        io.to(socket.id).emit('userAndGroup', { users, groups })
      })

      //查找关键字用户,搜索添加
      async function findUsers(search) {
        const searchKey = search.searchKey
        const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
          filters: {
            $or: [
              {
                name: {
                  $containsi: searchKey
                }
              },
              {
                email: {
                  $containsi: searchKey
                }
              },
            ]
          },
          sort: { createdAt: 'DESC' },
          populate: {
            avatar: {
              fields: ['url']
            }
          }
        });
        return users
      }

      // 查找群
      async function findGroups(search) {
        const searchKey = search.searchKey
        const groups = await strapi.entityService.findMany('api::group.group', {
          filters: {
            $or: [
              {
                name: {
                  $containsi: searchKey
                }
              },
              {
                uid: {
                  $containsi: searchKey
                }
              },
            ]
          },
          sort: { createdAt: 'DESC' },
          populate: {
            groupAvatar: {
              fields: ['url']
            },
          }
        });

        return groups
      }

      // 申请好友
      socket.on('applyUser', async ({ targetUser, data }) => {
        if (socket.user) {
          const myId = socket.user.id
          const id = targetUser.id
          // 查找是否已经有关系
          const friendship = await strapi.db.query('api::friendship.friendship').findOne({
            where: {
              $or: [
                {
                  user1: {
                    id: myId
                  },
                  user2: {
                    id: id
                  }
                },
                {
                  user1: {
                    id: id
                  },
                  user2: {
                    id: myId
                  }
                }
              ],
            },
            orderBy: { createdAt: 'DESC' },
            populate: {
              user_group_members: true,
            }
          });

          // 如果有，创建一个新的申请消息
          if (friendship && friendship.status !== 'accepted') {
            // console.log(friendship, 'cunzai')
            const fsid = friendship.id
            const userId = targetUser.id
            // 查找 好友组
            const userGs = await strapi.entityService.findMany('api::user-group-member.user-group-member', {
              filters: {
                friendship: {
                  id: fsid
                },
                user: {
                  id: userId
                }
              },
            });

            // console.log(userGs, '123333333')
            let ugmId = ''
            if (userGs.length == 0) {
              await strapi.entityService.create('api::user-group-member.user-group-member', {
                data: {
                  user_group: data.userGroup,
                  user: targetUser.id,
                  friendship: fsid,
                  fs: `${socket.user.id}${targetUser.id}`,
                  status: 'pending',
                },
              }).then(res => {
                ugmId = res.id
              })
            } else {
              ugmId = userGs[0].id
            }

            // 创建新申请消息
            strapi.entityService.create('api::message.message', {
              data: {
                "content": data.message,
                "sender": socket.user.id,
                fs: `${socket.user.id}${targetUser.id}`,
                "receiver": targetUser.id,
                type: 'note',
                friendship: friendship.id,
                user_group_member: ugmId,
                "isRead": false,
                status: 'pending'
              },
            }).then(res => {
              // 给自己发
              io.to(socket.id).emit('userApply', {
                user: targetUser, friendship: friendship, me: true, menu: false, message: res
              })

              // 给对方发
              const targetSocketId = userSocketMap[targetUser.username]
              io.to(targetSocketId).emit('userApply', {
                user: socket.user, friendship: friendship, me: false, menu: false, message: res
              })
            })

          } else { //如果没有，创建新的关系
            const entry = await strapi.entityService.create('api::friendship.friendship', {
              data: {
                user1: myId,
                user2: id,
              },
            });
            // console.log(entry)
            if (entry) {
              const targetSocketId = userSocketMap[targetUser.username]
              // 创建好友组关系
              await strapi.entityService.create('api::user-group-member.user-group-member', {
                data: {
                  user_group: data.userGroup,
                  user: targetUser.id,
                  fs: `${socket.user.id}${targetUser.id}`,
                  friendship: entry.id,
                  status: 'pending',
                },
              }).then(res => {
                console.log(res)
                // 创建好友申请消息
                strapi.entityService.create('api::message.message', {
                  data: {
                    "content": data.message,
                    "sender": socket.user.id,
                    fs: `${socket.user.id}${targetUser.id}`,
                    "receiver": targetUser.id,
                    type: 'note',
                    friendship: entry.id,
                    user_group_member: res.id,
                    "isRead": false,
                    status: 'pending'
                  },
                }).then(res => {
                  // 是否在线
                  if (targetSocketId && res.id) {
                    // 发送到对方
                    io.to(targetSocketId).emit('userApply', {
                      user: socket.user, friendship: entry, me: false, menu: false, message: res
                    })
                  }
                  // 发送给自己
                  io.to(socket.id).emit('userApply', {
                    user: targetUser, friendship: entry, me: true, menu: false, message: res
                  })
                });
              })
            }

          }
        }
      })

      // 处理申请好友操作
      socket.on('editApplyFriend', async ({ type, friendship, targetUser, userGroup }) => {
        if (socket.user) {
          const fsid = friendship.id
          const uid = targetUser.id

          const sh = await strapi.entityService.update('api::friendship.friendship', fsid, {
            data: {
              status: type,
              operator: socket.user.id
            },
            populate: {
              user1: true,
              user2: true
            }
          });

          if (sh) {
            if (type == 'accepted') {
              // 创建好友组关系，并设置为同意

              // 查找对方在不在我的组中，就是我也申请过，已经创建了userGroup-member
              const userGs = await strapi.entityService.findMany('api::user-group-member.user-group-member', {
                filters: {
                  friendship: {
                    id: fsid
                  },
                  user: {
                    id: uid
                  }
                },
              });

              // console.log(userGs)
              if (userGs.length == 0) {
                strapi.entityService.create('api::user-group-member.user-group-member', {
                  data: {
                    user_group: userGroup,
                    user: targetUser.id,
                    fs: `${socket.user.id}${targetUser.id}`,
                    friendship: friendship.id,
                    status: 'accepted',
                  },
                }).then(res => {
                  // console.log(res)
                  // 同意之后再将对方的好友组关系更新为同意状态
                  strapi.db.query('api::user-group-member.user-group-member').update({
                    where: {
                      friendship: { //关系，同一关系只有两条相对的好友组关系
                        id: fsid
                      },
                      $not: {  //除开我与ta的关系这一条，另一条就是发送者的ta与我的好友组关系，剩下发送者的好友组关系，进行设置为同意状态
                        user: {
                          id: uid
                        }
                      }
                    },
                    data: {
                      status: 'accepted',
                    },
                  });
                })
              } else {
                // 更新所有属于 该关系的好友组状态
                await strapi.db.query("api::user-group-member.user-group-member").updateMany({
                  where: {//关系，同一关系只有两条相对的好友组关系
                    $or: [
                      {
                        fs: `${sh.user1.id}${sh.user2.id}`
                      },
                      {
                        fs: `${sh.user2.id}${sh.user1.id}`
                      },
                    ],
                  },
                  data: {
                    status: 'accepted',
                  },
                });
              }
              // 将发送好友申请的所有消息设置为同意状态
              strapi.db.query("api::message.message").updateMany({
                where: {
                  $or: [
                    {
                      fs: `${sh.user1.id}${sh.user2.id}`
                    },
                    {
                      fs: `${sh.user2.id}${sh.user1.id}`
                    },
                  ],
                  type: 'note'
                },
                data: {
                  status: 'accepted',
                },
              });
            } else {
              // 将所有好友组关系更新为拒绝状态
              await strapi.db.query("api::user-group-member.user-group-member").updateMany({
                where: {//关系，同一关系只有两条相对的好友组关系
                  $or: [
                    {
                      fs: `${sh.user1.id}${sh.user2.id}`
                    },
                    {
                      fs: `${sh.user2.id}${sh.user1.id}`
                    },
                  ],
                },
                data: {
                  status: 'rejected',
                },
              });

              // 将发送好友申请的所有消息设置为拒绝状态
              await strapi.db.query("api::message.message").updateMany({
                where: {//关系，同一关系只有两条相对的好友组关系
                  $or: [
                    {
                      fs: `${sh.user1.id}${sh.user2.id}`
                    },
                    {
                      fs: `${sh.user2.id}${sh.user1.id}`
                    },
                  ],
                  type: 'note'
                },
                data: {
                  status: 'rejected',
                },
              });

            }

            // const targetSocketId = userSocketMap[targetUser.username]

            // io.to(socket.id).emit('applyFriendEdit', sh)
            // io.to(targetSocketId).emit('applyFriendEdit', sh)
            await getFriendNotification(targetUser)
            await getFriendNotification(socket.user)
          }
        }

      })

      // 申请入群
      socket.on('applyGroup', async ({ group: targeGroup, data }) => {
        if (socket.user) {
          const myId = socket.user.id
          const groupId = targeGroup.id

          // 查找是否已经有关系
          const groupMember1 = await strapi.db.query('api::group-member.group-member').findOne({
            where: {
              group: {
                id: groupId
              },
              user: {
                id: myId
              }
            },
            orderBy: { createdAt: 'DESC' },
            populate: {
              user: {
                populate: {
                  avatar: {
                    fields: ['url']
                  }
                }
              },
              group: {
                populate: {
                  admin_group_members: {
                    populate: {
                      user: {
                        fields: userFilter,
                        populate: {
                          avatar: {
                            fields: ['url']
                          }
                        }
                      }
                    }
                  },
                  groupAvatar: {
                    fields: ['url']
                  }
                }
              },
            }
          });

          let gm = null

          // 如果有，直接返回
          if (groupMember1) {

            gm = groupMember1

          } else { //如果没有，创建 群关系
            const groupMember = await strapi.entityService.create('api::group-member.group-member', {
              data: {
                user: myId,
                group: groupId,
              },
              populate: {
                user: {
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                },
                group: {
                  populate: {
                    admin_group_members: {
                      populate: {
                        user: {
                          fields: userFilter,
                          populate: {
                            avatar: {
                              fields: ['url']
                            }
                          }
                        }
                      }
                    },
                    groupAvatar: {
                      fields: ['url']
                    }
                  }
                },
              }
            });

            gm = groupMember

          }

          // 创建成功，添加通知消息
          if (gm) {
            strapi.entityService.create('api::message.message', {
              populate: {
                group_member: {
                  populate: {
                    fields: userFilter,
                    populate: {
                      avatar: {
                        fields: ['url']
                      }
                    }
                  }
                },
                group: {
                  populate: {
                    groupAvatar: {
                      fields: ['url']
                    }
                  }
                },
                sender: {
                  // 显示过滤
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                },
                receiver: {
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                }
              },
              data: {
                "content": data.message,
                "sender": socket.user.id,
                "isGroupMessage": true,
                group: targeGroup.id,
                type: 'note',
                group_member: gm.id,
                gm: `${targeGroup.id}${socket.user.id}`,
              },
            }).then(res => {
              // console.log(res)

              // 发送回本地自己
              io.to(socket.id).emit('groupApply', {
                message: res,
                me: true,
                menu: false,
                groupMember: gm
              })

              // 发送给群管理
              // console.log(gm, '123456')
              const groupAdmins = gm.group.admin_group_members

              groupAdmins.forEach((adminuser) => {
                const adminusername = adminuser.user.username

                const targetSocketId = userSocketMap[adminusername]

                // 新建通知消息到数据库
                strapi.entityService.create('api::message.message', {
                  populate: {
                    group_member: {
                      populate: {
                        fields: userFilter,
                        populate: {
                          avatar: {
                            fields: ['url']
                          }
                        }
                      }
                    },
                    group: {
                      populate: {
                        groupAvatar: {
                          fields: ['url']
                        }
                      }
                    },
                    sender: {
                      // 显示过滤
                      fields: userFilter,
                      populate: {
                        avatar: {
                          fields: ['url']
                        }
                      }
                    },
                    receiver: {
                      fields: userFilter,
                      populate: {
                        avatar: {
                          fields: ['url']
                        }
                      }
                    }
                  },
                  data: {
                    "content": data.message,
                    "sender": socket.user.id,
                    gm: `${targeGroup.id}${socket.user.id}`,
                    "receiver": adminuser.user.id,
                    type: 'note',
                    group: targeGroup.id,
                    group_member: gm.id,
                    "isRead": false
                  },
                }).then(res => {
                  // 发送给管理员
                  socket.to(targetSocketId).emit('groupApply', {
                    message: res,
                    me: false,
                    menu: false,
                    groupMember: gm
                  })
                })
              })

            })
          }
        }
      })

      // 处理入群申请
      socket.on('editApplyGroup', async ({ type, groupMemberId }) => {
        if (socket.user) {

          // 更新状态
          await strapi.entityService.update('api::group-member.group-member', groupMemberId, {
            data: {
              status: type,
              operator: socket.user.id
            },
            populate: {
              user: {
                // 显示过滤
                fields: userFilter,
                populate: {
                  avatar: {
                    fields: ['url']
                  }
                }
              },
              group: true
            }
          }).then(res => {
            strapi.db.query("api::message.message").updateMany({
              where: {
                gm: `${res.group.id}${res.user.id}`,
                status: 'pending'
              },
              data: {
                status: type,
              },
            });
            // console.log(res)

            // 成功之后重新请求群通知列表
            getGroupNOtification(res.user)
            getGroupNOtification(socket.user)
          })
          // 发送回自己
          // io.to(socket.id).emit('applyGroupEdit', entry)

          // 发送给请求方
          // const targetSocketId = userSocketMap[entry.user.username]
          // io.to(targetSocketId).emit('applyGroupEdit', entry)

        }
      })

      // 获取好友通知
      socket.on('friendNotification', async () => {
        if (socket.user) {
          await getFriendNotification(socket.user)
        }
      })
      // 获取好友通知
      async function getFriendNotification(user) {
        // console.log(user)
        const userId = user.id

        const messages = await strapi.entityService.findMany('api::message.message', {
          sort: { createdAt: 'DESC' },
          filters: {
            type: 'note',
            isGroupMessage: false,
            friendship: {
              $not: true,
            },
            $or: [
              {
                sender: {
                  id: userId
                }
              },
              {
                receiver: {
                  id: userId
                }
              }
            ],
          },
          populate: {
            friendship: true,
            sender: {
              // 显示过滤
              fields: userFilter,
              populate: {
                avatar: {
                  fields: ['url']
                }
              }
            },
            receiver: {
              fields: userFilter,
              populate: {
                avatar: {
                  fields: ['url']
                }
              }
            }
          },

        });

        const data = messages.map(msg => {
          if (msg.sender.id == user.id) {
            return {
              menu: false,
              friendship: msg.friendship,
              me: true,
              user: msg.receiver,
              message: msg
            }
          } else {
            return {
              menu: false,
              friendship: msg.friendship,
              me: false,
              user: msg.sender,
              message: msg
            }
          }
        });

        const targetSocketId = userSocketMap[user.username]
        io.to(targetSocketId).emit('friendnotif', data)
      }
      // 获取群通知
      socket.on('groupNotification', async () => {
        if (socket.user) {
          await getGroupNOtification(socket.user)
        }
      })
      // 
      // 获取群通知
      async function getGroupNOtification(user) {
        // console.log(user)
        const userId = user.id

        const messages = await strapi.entityService.findMany('api::message.message', {
          sort: { createdAt: 'DESC' },
          filters: {
            type: 'note',
            group_member: {
              $not: true,
            },
            $or: [
              {
                sender: {
                  id: userId
                }
              },
              {
                receiver: {
                  id: userId
                }
              }
            ],
          },
          populate: {
            group_member: {
              populate: {
                operator: {
                  fields: userFilter,
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                },
              }
            },
            group: {
              populate: {
                groupAvatar: {
                  fields: ['url']
                }
              }
            },
            sender: {
              // 显示过滤
              fields: userFilter,
              populate: {
                avatar: {
                  fields: ['url']
                }
              }
            },
            receiver: {
              fields: userFilter,
              populate: {
                avatar: {
                  fields: ['url']
                }
              }
            }
          }
        });

        // console.log(messages)

        const data11 = []
        messages.forEach(msg => {
          if (msg.receiver && msg.receiver.id !== user.id) {
            //   const data = {
            //     message: '',
            //     me: false,
            //     groupMember: ''
            // }
          } else {
            data11.push({
              menu: false,
              me: msg.sender.id == user.id ? true : false,
              groupMember: msg.group_member,
              message: msg
            })
          }
        });

        // 发送给特定
        const targetSocketId = userSocketMap[user.username]
        io.to(targetSocketId).emit('groupnotif', {
          data: data11,
        })

        // console.log(messages)
      }

      // 获取公钥
      socket.on('sendPublicKey', ({ publicKey2, targetUser }) => {
        if (socket.user) {
          // console.log(publicKey2, targetUser)
          const targetSocketId = userSocketMap[targetUser.username]
          io.to(targetSocketId).emit('publicKey', { publicKey2, user: socket.user })
        }
      })

      // 获取公钥和对称密钥
      socket.on('publicKeyAndSYmmetricKey', ({ publicKey2, symmetricKey, targetUser }) => {
        if (socket.user) {
          // console.log(publicKey2, symmetricKey, '12311')
          const targetSocketId = userSocketMap[targetUser.username]
          io.to(targetSocketId).emit('publicAndSYmmetricKey', { publicKey2: publicKey2, symmetricKey, user: socket.user })
        }
      })

      // 创建群聊
      socket.on('createGroup', async (data) => {
        if (socket.user) {
          // console.log(data)

          const lastGroup = await strapi.db.query('api::group.group').findOne({
            orderBy: { createdAt: 'DESC' },
          })

          let uid = lastGroup.uid.substring(1)

          uid = (Number(uid) + 1) + ''

          // console.log(uid)
          if (uid.length < 7) {
            uid = uid.padStart(7, '0')
          }

          // console.log(uid)
          const group = await strapi.entityService.create('api::group.group', {
            data: {
              groupAvatar: 5,
              "name": data.name,
              create_by: socket.user.id,
              "description": data.description,
              "groupname": `g` + uid,
              uid: `g` + uid
            },
          });

          // console.log(group)

          const admin_group_member = await strapi.entityService.create('api::group-member.group-member', {
            data: {
              "group": group.id,
              "user": socket.user.id,
              "status": "accepted",
              "role": "admin",
              "operator": socket.user.id,
              admin_group: group.id
            },
          });
          const friends = data.friends.map((d) => ({
            "group": group.id,
            user: d.id,
            "status": "accepted",
            "role": "base",
            "operator": socket.user.id,
          }))

          // console.log(friends, '1222')
          for(let i =0; i< friends.length; i++) {
            const group_members =  await strapi.entityService.create("api::group-member.group-member", {
              data: friends[i],
            });

            // console.log(group_members)
          }
          // console.log(admin_group_member,)
          await getUsers(socket.user)
        }

      })

    });


    httpServer.listen(1338);
  },
};
