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

    const { createServer } = require("http");
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
      console.log(socket.id)
      console.log('a user connected');

      // 断开连接
      socket.on('disconnect', async () => {
        console.log('user disconnected');
        // 账号下线
        if (socket.user) {

          const entry = await strapi.entityService.update('plugin::users-permissions.user', socket.user.id, {
            data: {
              online: false,
            },
            fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
          });

          console.log(entry)

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

      //  设置用户名
      socket.on('setUsername', async (user) => {
        let userId = null
        if (user) {
          userId = user.id
          socket.user = user
        }
        if (userId) {
          // 设置账号在线状态,返回账号更新后的信息
          const entry = await strapi.entityService.update('plugin::users-permissions.user', userId, {
            data: {
              online: true,
            },
            fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
          });

          console.log(entry)

          if (entry) {
            // 更新之后返回该用户的群组信息
            io.emit('online', {
              username: entry.username
            })
          }

          // 获取群组
          const groups = await strapi.entityService.findMany('api::group-member.group-member', {
            filters: {
              user: {
                id: userId
              },
            },
            populate: {
              group: {
                populate: {
                  create_by: {
                    fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
                    populate: {
                      avatar: {
                        fields: ['url']
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

          console.log(groups)

          // 获取群组中所有用户
          async function getGroupUsers(group) {
            const users = await strapi.entityService.findMany('api::group-member.group-member', {
              filters: {
                group: {
                  id: group.id
                },
              },
              populate: {
                user: {
                  fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                }
              }
            })

            return users.map(user => user.user)
          }

          if (groups) {
            let data = []
            for (let i = 0; i < groups.length; i++) {
              const g = groups[i].group
              const users = await getGroupUsers(g)
              data.push({
                ...g,
                users: users
              })
            }

            io.to(socket.id).emit('groups', data)
          }

          // 请求联系人列表
          const friendships = await strapi.entityService.findMany('api::friendship.friendship', {
            filters: {
              $or: [
                {
                  user1: {
                    id: user.id
                  }
                },
                {
                  user2: {
                    id: user.id
                  }
                }
              ],
              status: 'accepted'
            },
            sort: { createdAt: 'DESC' },
            // 查询深度
            populate: {
              user1: {
                // 显示过滤
                fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
                populate: {
                  avatar: {
                    fields: ['url']
                  }
                }
              },
              user2: {
                fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
                populate: {
                  avatar: {
                    fields: ['url']
                  }
                }
              }
            },
          })


          // 获取未读消息数和最后消息
          for (let i = 0; i < friendships.length; i++) {
            const count1 = await getunReadMessage(friendships[i].user1, friendships[i].user2)
            const count2 = await getunReadMessage(friendships[i].user2, friendships[i].user1)

            console.log(count1, count2)
            // 未读消息数
            friendships[i]['user1']['count'] = count1
            friendships[i]['user2']['count'] = count2

            // 最后一条消息
            friendships[i]['lastMsg'] = await strapi.db.query('api::message.message').findOne({
              select: ['content', 'createdAt'],
              where: {
                $or: [
                  {
                    sender: {
                      id: friendships[i].user1.id
                    },
                    receiver: {
                      id: friendships[i].user2.id
                    }
                  },
                  {
                    sender: {
                      id: friendships[i].user2.id
                    },
                    receiver: {
                      id: friendships[i].user1.id
                    }
                  }
                ],
              },
              orderBy: { createdAt: 'DESC' },
              populate: { content: true },
            });
          }

          // 个人信息，如果id等于user1的id,为user1,否则为user2

          if (friendships[0].user1.id === user.id) {
            userInfo = friendships[0].user1
          } else {
            userInfo = friendships[0].user2
          }
          // 发送个人信息
          io.to(socket.id).emit('userInfo', userInfo)
          // 设置当前用户
          socket.user = userInfo
          // 发送联系人列表
          io.to(socket.id).emit("friendsList", friendships);


          // 添加用户到列表
          userSocketMap[user.username] = socket.id


          // 获取用户组
          const userGroups = await strapi.entityService.findMany('api::user-group.user-group', {
            filters: {
              create_by: {
                id: user.id
              },
            },
            sort: { createdAt: 'ASC' },
          });

          console.log(userGroups, 444)

          let userGroupMembers = []

          for (let i = 0; i < userGroups.length; i++) {

            const userGroupMember = await getUserGroupMember(userGroups[i])

            userGroupMembers.push({
              userGroup: userGroups[i],
              userGroupMembers: userGroupMember.map(userGroup => userGroup.user)
            })

          }

          console.log(userGroupMembers)

          // 返回用户列表
          io.to(socket.id).emit("userGroup", userGroupMembers);

        }

      })

      // 获取对应好友组的好友
      async function getUserGroupMember(userGroup) {
        const users = await strapi.entityService.findMany('api::user-group-member.user-group-member', {
          filters: {
            user_group: {
              id: userGroup.id
            },
          },
          populate: {
            user: {
              // 显示过滤
              fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
              populate: {
                avatar: {
                  fields: ['url']
                }
              }
            },
          }
        });

        return users
      }

      // 加入群聊
      socket.on('joinRoom', (roomName) => {
        console.log(roomName, '666')
        socket.join(roomName)
      })

      // 离开群聊
      socket.on('leaveRoom', (roomName) => {
        console.log(roomName, '666')
        socket.leave(roomName)
      })

      // 接收私聊
      socket.on('privateMessage', ({ targetUser, message }) => {

        strapi.log.info(targetUser.username)
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
              friendship: socket.user.username + '_' + targetUser.groupname,
              "isRead": false
            },
          }).then(res => {
            // 发给特定房间
            socket.to(targetUser.uid).emit('receivePrivateMessage', {
              user: { ...targetUser, avatar: socket.user.avatar }, me: false, msg: res
            })
            // 发送给自己
            io.to(socket.id).emit('receivePrivateMessage', {
              user: { ...targetUser, avatar: socket.user.avatar }, me: true, msg: res
            })
          });


        } else {
          const targetSocketId = userSocketMap[targetUser.username]

          // 并保存到数据库
          strapi.entityService.create('api::message.message', {
            data: {
              "content": message,
              "sender": socket.user.id,
              "receiver": targetUser.id,
              friendship: socket.user.username + '_' + targetUser.username,
              "isRead": false
            },
          }).then(res => {
            // 是否在线
            if (targetSocketId && res.id) {
              // 发送到本地 特定用户
              io.to(targetSocketId).emit('receivePrivateMessage', {
                user: socket.user, me: false, msg: res
              })
            }
            // 发送给自己
            io.to(socket.id).emit('receivePrivateMessage', {
              user: socket.user, me: true, msg: res
            })
          });
        }
      })

      // 获取消息记录
      async function getMsg(targetUser, currentUser) {

        console.log(targetUser, currentUser)
        if (currentUser) {
          if (targetUser.tab == 'friends') {
            const msgs = await strapi.entityService.findMany('api::message.message', {
              filters: {
                $or: [
                  {
                    sender: {
                      id: targetUser.id
                    },
                    receiver: {
                      id: currentUser.id
                    }
                  },
                  {
                    sender: {
                      id: currentUser.id
                    },
                    receiver: {
                      id: targetUser.id
                    }
                  }
                ],
              },
              sort: { createdAt: 'ASC' },
              // 查询深度
              populate: {
                sender: {
                  // 显示过滤
                  fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                },
                receiver: {
                  fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
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
              sort: { createdAt: 'ASC' },
              // 查询深度
              populate: {
                sender: {
                  // 显示过滤
                  fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
                  populate: {
                    avatar: {
                      fields: ['url']
                    }
                  }
                },
                receiver: {
                  fields: ['username', 'online', 'name', 'email', 'uid', 'birthday', 'gender', 'region', 'description'],
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
      socket.on('history', async ({ sender, receiver }) => {

        const entry = await strapi.db.query("api::message.message").updateMany({
          where: {
            friendship: `${sender.username}_${receiver.username}`,
            isRead: false
          },
          data: {
            isRead: true,
          },
        });

        console.log(entry)

        const hisotry = await getMsg(sender, socket.user)

        // console.log(hisotry)

        io.to(socket.id).emit('historyMsgs', hisotry)

      })

      // // 广播消息
      socket.on('chat', (msg) => {
        strapi.log.info('message: ' + msg + socket.user.username);
        // socket.broadcast.emit('chat message', `${socket.username}: ${msg}`) //除了自己

        // 广播消息
        io.emit("chat message", {
          user: socket.user,
          msg: msg
        });
      });


    });


    httpServer.listen(1338);
  },
};
