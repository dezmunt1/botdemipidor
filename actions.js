const Router = require('telegraf/router')
const {respectMongoListener} = require('./utils/mongoDB/mongoListener')
const {setSource, delSource, selectSource, selectedSource, replys, typeSource} = require('./handlers/postme')

const callbackQuerys = new Router((ctx) => {
  if (!ctx.callbackQuery.data) {
    return
  }
  const cbData = ctx.callbackQuery.data.split(':')
  return {
    route: cbData[0],
    state: {
      cbParams: cbData[1]
    }
  }
})

// DELORIAN

callbackQuerys.on('sendFuture', (ctx) => {
  try {
    if ( !ctx.session.delorian ) {
      ctx.answerCbQuery('Этот опрос не актуален, введите /delorian еще раз', false)
      return ctx.deleteMessage(ctx.callbackQuery.message.message_id)
    }
    ctx.scene.enter('sendFuture')
    console.log('Вход в сцену sendFuture')
  } catch(e) {
    ctx.answerCbQuery('Этот опрос не актуален, введите /delorian еще раз', false)
  }
})

callbackQuerys.on('exitScene', (ctx) => {
  ctx.deleteMessage(ctx.callbackQuery.message.message_id)
  ctx.answerCbQuery('Ну и не надо', false)
  if (ctx.scene.current) {
    ctx.scene.leave()
    console.log('Выход из сцены')
  }
})

// RESPEKT

callbackQuerys.on('like', (ctx) => {
  respectMongoListener(ctx)
  ctx.answerCbQuery('Заебись', false)
})

callbackQuerys.on('dislike', (ctx) => {
  respectMongoListener(ctx)
  ctx.answerCbQuery('Говно', false)
})

// POSTME

callbackQuerys.on('selectSource', (ctx) => {
  try {
    const page = ctx.state.cbParams
    return selectSource( ctx, { page: +page } )
  } catch(e) { 
    ctx.answerCbQuery('Этот опрос не актуален', false)
  }
})

callbackQuerys.on('selectedSource', (ctx) => {
  try {
    const resource = ctx.state.cbParams
    selectedSource(ctx, resource)
  } catch(e) {
    ctx.answerCbQuery('Этот опрос не актуален', false)
  }
})

callbackQuerys.on('setSource', async (ctx) => {
  try {
    if (ctx.chat.type !== 'private' && ctx.chat.username) { // Public Group
      return setSource(ctx)
    }
    if (ctx.chat.type !== 'private' && !ctx.chat.username) { // Private Group
      return setSource(ctx, {problem: 'chatType'})
    }
    return setSource(ctx, {problem: 'private'})
  } catch(error) { 
    console.error( error )
  }
})

callbackQuerys.on('getSource', (ctx) => {
  try {
    const resource = ctx.state.cbParams
    replys(ctx, resource)
  } catch(e) {
    ctx.answerCbQuery('Этот опрос не актуален', false)
  }
})

callbackQuerys.on('typeSource', (ctx) => {
  try {
    const msgType = ctx.state.cbParams
    typeSource(ctx, msgType)
    ctx.answerCbQuery(null, false)
  } catch(e) {
    ctx.answerCbQuery('Этот опрос не актуален', false)
  }
})

callbackQuerys.on('delSource', (ctx) => {
  try {
    delSource(ctx)
  } catch(e) {
    ctx.answerCbQuery('Этот опрос не актуален', false)
  }
})

callbackQuerys.on('replyMore', (ctx) => {
    return replys(ctx, 'contentMore')
})

callbackQuerys.on('deleteThisMsg', (ctx) => {
  try {
    ctx.deleteMessage(ctx.callbackQuery.message.message_id)
  } catch(e) {
    ctx.answerCbQuery('Этот опрос не актуален', false)
  }
})

callbackQuerys.on('postmeSetPassword', ctx => {
  const setPassword = ctx.state.cbParams
  const newState = Object.assign( ctx.scene.state, { setPassword } )
  ctx.scene.leave()
  ctx.scene.enter( 'chatRegister', newState )
})

callbackQuerys.on('plug', ctx => {
  ctx.answerCbQuery(null, false)
})


module.exports =  {
  callbackQuerys
}
