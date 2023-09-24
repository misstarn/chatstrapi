// // 显示谁在线，在线列表
// let onlineUsers = []

// // 用户列表Map
// const userSocketMap = {}
// module.exports = ({ env }) => ({
//     // ...
//     "io": {
//       "enabled": true,
//       "config": {
//         "IOServerOptions" :{
//           "cors": { "origin": "http://localhost:3000", "methods": ['GET', 'PUT', 'POST'] },
//         },
//         "contentTypes": {
//           "message": "*",
//           "chat":"*"
//         },
//         "events":[
//           {
//             "name": "connection",
//             "handler": ({ strapi }, socket) => {
//                 strapi.log.info(`[io] new connection with id ${socket.id}`);

//                 // 设置用户名
//                 socket.on('setUsername', ({ username }) => {
//                     // 设置用户名
//                     strapi.log.info(username)
//                     socket.username = username
                    
//                     // 新用户连接，将新用户加入列表
//                     onlineUsers.push(username)
                    
//                     strapi.$io.emit("api::updateUserList.updateUserList.update", onlineUsers);

//                     // 添加用户到列表
//                     userSocketMap[username] = socket.id

//                 })

//                 // // 广播消息
//                 socket.on('chat', (msg) => {
//                     strapi.log.info('message: ' + msg + socket.username);
//                     // socket.broadcast.emit('chat message', `${socket.username}: ${msg}`) //除了自己
                    
//                     strapi.$io.emit("api::chat.chat", `${socket.username}: ${msg}`);
//                 });
//             },
//           },
//         ]
//       },
//     },
//     // ...
//   });