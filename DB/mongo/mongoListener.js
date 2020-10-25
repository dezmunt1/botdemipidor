const redisClient = require('../redis/redisInit')
const articleParser = require('../../utils/articleParser')
const Markup = require('telegraf/markup')
const {
  DelorianModel,
  RespectModel,
  ArticleModel,
  UserModel,
  ChatModel,
  AdminModel
} = require('./models/schemas')
const { Types } = require('mongoose')
const { Random } = require('random-js')
const { hashPassword, checkHashPassword } = require('../../utils/utils')





const random = new Random()

const checkDelorianStore = ( ctx ) => {
  let timerId
  const start = async () => {
    clearTimeout( timerId )
    try {
      const getRemindes = await redisClient.get('delorian')
      const watchArr = JSON.parse( getRemindes )

      timerId = setTimeout( async function check( watchArr ) {
        const now = new Date()
        const remindNow = []
        const newWatchArray = watchArr.map( remindes => {
          const remindTIme = new Date( remindes.remindTime ) // Из UTC в локальное время
          if ( remindTIme > now ) {
            return remindes
          }
          remindNow.push( Types.ObjectId( remindes.dbId ) )
        })

        if ( !remindNow.length ) {
          timerId = setTimeout( check, 1000, newWatchArray)
          return undefined
        }

        const getRemindes = await DelorianModel.find( {_id: { $in: remindNow }})

        getRemindes.forEach( async remindes => {
          const { user } = await ctx.telegram.getChatMember( remindes.chatId, remindes.userId )
          const message = `[ПРИВЕТ ИЗ ПРОШЛОГО ДЛЯ @${user.username}]: ${remindes.text}`
          ctx.telegram.sendMessage( remindes.chatId, message)
        })

        await DelorianModel.updateMany(
          { _id: { $in: remindNow } },
          { $set: { "performed" : true } }
        )

        refresh()
          
      }, 1000, watchArr)
      
    } catch (error) {
      console.error( error )
    }
  }

  const stop = () => {
    clearTimeout( timerId )
  }
  
  const refresh = () => {
    clearTimeout( timerId )
    dlMongoListener( ctx )
  }

  return {
    start,
    stop,
    refresh
  }

}

const dlMongoListener = async function(ctx, newData) {
  const check = checkDelorianStore( ctx )
  try {
    if ( newData ) {
      return check.refresh()
    }
    await redisClient.set('delorian', JSON.stringify([]))
    const now = new Date()

    const updateStore = await DelorianModel.find( {remindTime: { $gte: now}, performed: false} )

    if ( !updateStore.length ) {
      return undefined
    }

    const remindsStore = []
    updateStore.forEach( item => {
      remindsStore.push( {userId: item.userId, remindTime: item.remindTime, dbId: item.id} )
    })

    await redisClient.set('delorian', JSON.stringify( remindsStore ))

    check.start()

  } catch (error) {
    console.error( error )
  }
}

const addDelorianModel = data => {
  if ( !data ) {
    return
  }
  const newEntry = new DelorianModel( data )
  newEntry.save()
}

const respectMongoListener = function(ctx) {
  let thisChatId = ctx.chat.id
  let thisMessId = ctx.callbackQuery.message.message_id
  let rate = ctx.callbackQuery.data

  if(rate == 'like' || rate == 'dislike') {
    RespectModel.findOne({chatId: thisChatId, messageId: thisMessId},(err, res) =>{
      if (err || res === null) {
        console.log(err)
        return
      }

      res[rate]++
      ctx.telegram.editMessageText(res.chatId, res.messageId, null, res.text, Markup.inlineKeyboard([
        Markup.callbackButton(`👍 ${res.like}`, 'like'),
        Markup.callbackButton(`👎 ${res.dislike}`, 'dislike')
      ]).extra())
        .catch(err =>{
          if (err.on.payload.text === res.text) {
            console.log('Текст не изменялся')
          }
        })
      res.save((err)=>{
        if (err) {
          console.error(err)
        }
      })
    })
    .catch()
  }
}

const articleMongoListener = async function(reqResource, resourceParser) {
  try {
    if ( !reqResource ) {
      throw new Error('[articleMongoListener]: Request resource type not specified')
    }

    const articleData = await	ArticleModel.findOne({resource: reqResource})

    if ( !articleData ) {
      const parsedData = await resourceParser()
      let newRes = new ArticleModel({
        resource: reqResource,
        data: parsedData,
        funcName: resourceParser.name,
        date: new Date()
      })
      await newRes.save()
      return newRes.data
    }

    return articleData.data
    
  } catch (error) {
    console.error(error.message)
    return undefined
  }
}

const updateArticleResources = async () => {
  try {
    const allResources = 	await ArticleModel.find()
    if ( !allResources.length ) {
      throw new Error("[updateArticleResources]: В БД действующих ресурсов не существует")
    }

    allResources.forEach( async resourceItem => {
      const resource = resourceItem.resource
      const funcName = resourceItem.funcName
      console.log(`Начинаю парсить "${resource.toUpperCase()}"`)

      const parsedRosource = await articleParser[funcName]()
      const newDate = new Date()

      const requestResourceUpdate = await ArticleModel.updateMany({_id: resourceItem._id}, {
        date: newDate,
        data: parsedRosource
      })

      if ( requestResourceUpdate.nModified ) {
        console.log(`[updateArticleResources]: Ресурс "${resource.toUpperCase()}" успешно отпарсен, и записан в БД`)
      }
    })

    return undefined
  } catch (error) {
    console.error(error.message)
  }
}

const userMongoListener = function(ctx, params) {
  return new Promise ((resolve, rej) => {
    if ( !ctx.from ) {
      rej( `В ${ctx.chat.title} сохранение пользователей в ДБ не доступно` )
    }

    UserModel.findOne({userId: ctx.from.id}, (err, res) =>{
      if (err) {
        console.log(err)
        return
      }

      if (res) {
        resolve(res)
      }

      if (res === null) {
        const newUser = new UserModel({
          firstName: ctx.from.first_name,
          userName: ctx.from.username || ctx.from.first_name,
          userId: ctx.from.id,
          isBot: ctx.from.is_bot,
          lang: ctx.from.language_code,
        })

        newUser.save((err, savedUser)=>{
          if (err) {
            console.error(err)
          }
          resolve(`Добавлен новый пользователь ${savedUser.userName}`)
        })
      }
    })
  })
}

const postmeMongoListener = async function( options, type ) {
  try {
    if ( type === 'getMediatypes' ) {
      const getMediatypes = await ChatModel.findOne({chatID: options.chatId})
      return getMediatypes.postme.mediaTypes
    }

    if (type === 'setMediatypes') {
      const mediaTypes = await ChatModel.findOne({chatID: options.chatId})
      if ( !mediaTypes ) {
        throw new Error('Media types dont\'t exist!')
      }

      switch(options.msgType) {
        case 'current':
          return mediaTypes.postme.mediaTypes
        case 'all':
          mediaTypes.postme.mediaTypes.links = false
          mediaTypes.postme.mediaTypes.video = false
          mediaTypes.postme.mediaTypes.photo = false
          mediaTypes.postme.mediaTypes.audio = false
          mediaTypes.postme.mediaTypes.all = !mediaTypes.postme.mediaTypes.all
          break
        case 'photo':
          mediaTypes.postme.mediaTypes.all = false
          mediaTypes.postme.mediaTypes.photo = !mediaTypes.postme.mediaTypes.photo
          break
        case 'video':
          mediaTypes.postme.mediaTypes.all = false
          mediaTypes.postme.mediaTypes.video = !mediaTypes.postme.mediaTypes.video
          break
        case 'links':
          mediaTypes.postme.mediaTypes.all = false
          mediaTypes.postme.mediaTypes.links = !mediaTypes.postme.mediaTypes.links
          break
        case 'audio':
          mediaTypes.postme.mediaTypes.all = false
          mediaTypes.postme.mediaTypes.audio = !mediaTypes.postme.mediaTypes.audio
          break
      }

      await mediaTypes.save()
      return mediaTypes.postme.mediaTypes
    }

    if ( type === 'getPost' ) {
      const allMediaTypes = random.shuffle([
        "$links",
        "$photo",
        "$animation",
        "$video",
        "$audio",
        "$voicenote",
        "$videonote",
      ])
      let randomType

      const selectedMediaTypesArr = Object.entries( options.mediaTypes.toJSON() )
          .filter( type => type[1] === true)
          .map( type => type[0])

      const getListenerChat = await ChatModel.findOne({chatID: options.chatId})
      if ( !getListenerChat ) {
        throw new Error('Chat not found')
      }
      if (getListenerChat.postme.listening === 0) {
        return 'Сначала веберите источник. <b>Введите</b> <code>/postme options</code>'
      }

      const listeningChatId = getListenerChat.postme.listening
      
      
      const getPost = async (data) => {
        if (!selectedMediaTypesArr.length) {
          return data
        }
        const randomCount = random.integer(0, selectedMediaTypesArr.length - 1)

        randomType = selectedMediaTypesArr[randomCount] === 'all'
            ? selectedMediaTypesArr[randomCount]
            : selectedMediaTypesArr.splice(randomCount, 1)[0]

        const mediaType = randomType === 'all' ? [allMediaTypes.pop()] : 
        randomType === 'audio' ? ['$audio', '$voicenote'] :
        randomType === 'photo' ? ['$photo'] :
        randomType === 'video' ? ['$video', '$videonote', '$animation'] : ['$links']

        const getData = await ChatModel.aggregate([
          {$match: {chatID: getListenerChat.postme.listening}},
          {$replaceRoot : {newRoot: `$$ROOT.postme.content`}},
          {$project: { [randomType]: {
            $concatArrays: mediaType
          } } },
          {$unwind: `$${randomType}`},
          {$sample: {size: 1}}
        ])

        if ( !getData.length && selectedMediaTypesArr.length && allMediaTypes.length ) {
          return getPost( getData )
        }
        return getData
      }

      const post = await getPost()

      if ( !post.length ) {
        return undefined
      }

      const postedMessage = post[0][randomType]
      redisClient.emitter.emit(
        'sendPost',
        {
          action: 'sendMessage',
          message: postedMessage,
          chatIdTarget: options.chatId,
          chatId: listeningChatId
        }
      )
      return true
    }

    if ( type === 'listening' ) {

      const listenerChat = await ChatModel.findOneAndUpdate(
        { chatID: options.listenerChatId },
        { $set: {'postme.listening': options.listeningChatId } }
      )
      
      if ( listenerChat.postme.listening ) {
        await ChatModel.updateOne(
          { chatID: listenerChat.postme.listening },
          { $pull: { 'postme.listeners': listenerChat.chatID} }
        )
      }
      
      await ChatModel.updateOne(
        { chatID: options.listeningChatId },
        { $push: {'postme.listeners': options.listenerChatId } }
      )

      return 'Ресурс успешно выбран!'
    }

    if ( type === 'protected' ) {
      try {
        const listenerChat = await ChatModel.findOne(
          { chatID: options.listeningChatId },
          { "postme.passwordRequired": 1 }
        )
        const isProtected = listenerChat
            ? { isProtected: listenerChat.postme.passwordRequired }
            : false
        return isProtected
      } catch (error) {
        console.error(error)
      }
    }

    if ( type === 'getHash' ) {
      const listenerChat = await ChatModel.findOne(
        { chatID: options.listeningChatId },
        { "postme.password": 1 }
      )
      const password = listenerChat ? { password: listenerChat.postme.password } : false
      return password
    }

    if ( type === 'selectSource') {
      const { page, limit } = options
      const getActiveResources = await ChatModel
          .find(
            {"postme.resourceActive": true},
            {
              "chatType": 1,
              "title": 1,
              "username": 1,
              "chatID": 1,
              "postme.passwordRequired": 1,
            }
          )
          .sort({'postme.dateActive': -1})
          .skip( page * limit )
          .limit( limit + 1 ) // +1 to track the end of data

      if ( !getActiveResources.length ) {
        return(false)
      }

      return getActiveResources
    }

    if ( type === 'adding' ) {
      const chat = await ChatModel.findOne({chatID: options.chatId})
      if ( !chat ) {
        throw new Error(`Сhat [id: ${options.chatId}] not found`)
      }

      if ( options.problem ) {
        chat.postme.resourceActive = false
        chat.markModified('postme')
        await chat.save()
        const message = options.problem === 'chatType'
            ? `Для добавления ресурса в базу, добавьте к себе пользователя ${process.env.NAME_SHEN_VISOR}`
            : options.problem === 'private'
              ? `В личных сообщения функция Postme неработает, только каналы или группы`
              : 'Заглушка'
        return message
      }

      if (chat.postme.resourceActive === true) {
        return 'Чат уже в базе данных'
      }

      chat.postme.resourceActive = true
      chat.postme.passwordRequired = false
      chat.postme.dateActive = new Date()

      if (options.setPassword) {
        chat.postme.passwordRequired = true
        chat.postme.password = await hashPassword(options.password)
      }
      
      await chat.save()

      redisClient.emitter.emit('adding', {
        action: 'scrapChat',
        chatId: chat.chatID,
        userbotExist: options.userbotExist
      })
      
      return 'Чат добавлен в базу данных'
    }

    if ( type === 'delete' ) {
      await ChatModel.updateMany(
        { 'postme.listening': options.chatId },
        { $set: {'postme.listening': 0} },
        { multi: true }
      )

      await ChatModel.updateOne(
        { chatID: options.chatId },
        [
          {
            $set: {
              'postme.listeners': [],
              'postme.resourceActive': false,
              'postme.passwordRequired': false,
              'postme.password': ''

            }
          }, 
          {
            $unset: ['postme.content']
          },
        ],
        {multi: true}
      )
      return true
    }
    
  } catch (error) {
    console.error(error)
  }
}

const addChatMongoListener = function(chat, ctx) {
  return new Promise( (resolve, rej) => {
    ChatModel.findOne({chatID: chat.id}, async (err, res) =>{
      if (err) {
        console.log(err)
        return
      }

      const getChat = ctx ? await ctx.getChat() : false
      const private = !getChat
          ? chat.private
          : getChat.username
            ? false
            : true

      if (res === null) {
        const newChat = new ChatModel({
          chatID: chat.id,
          description: chat.description || 'Без описания',
          photoLogo: chat.photo,
          title: chat.title,
          chatType: chat.type,
          username: chat.username || 'Без имени',
          maxMsgId: returnMsgId(ctx),
          private,
          listening: [],
        })

        newChat.save( (err, futureMessage) => {
          if (err) {
            console.error(err)
          }
          resolve(`${chat.type} ${chat.title || chat.username} успешно добавлен в базу`)
        })
      }

      if (res) {
        res.description = chat.description || 'Без описания'
        res.photoLogo = chat.photo
        res.title = chat.title
        res.chatType = chat.type
        res.username = chat.username
        res.private = private

        if (returnMsgId(ctx)) {
          res.maxMsgId = returnMsgId(ctx)
        }
        res.save( (err, futureMessage) => {
          if (err) console.error(err)
          resolve(`${chat.type} ${chat.title || chat.username} успешно обновлен`)
        })
      }
    })
  })
}

const adminMongoListener = async function( options, type ) {
  if ( type === 'checkPassword' ) {
    const admin = await AdminModel.findOne()
    const checkPassword = await checkHashPassword(options.password, admin.password)
    return checkPassword
  }

  if ( type === 'addingChat' ) {
    const getChat = options.userBotData
        ? await new addChatMongoListener({
          id: options.chatId,
          description: options.description || 'Без описания',
          photo: options.photoLogo,
          title: options.title,
          type: options.chatType,
          username: options.username || 'Без имени',
          private: options.private,
          listening: [],
        })
        : await ChatModel.findOne({chatID: options.chatId})

    if ( !getChat && !options.userBotData ) {
      redisClient.emitter.emit('getChatInfo', {
        ...options,
        action: 'getChatInfo'
      })
      return
    }

    const chat = typeof getChat === 'string'
        ? await ChatModel.findOne({chatID: options.chatId})
        : getChat

    if (chat.postme.resourceActive === true) {
      return 'Чат уже в базе данных'
    }

    chat.postme.resourceActive = true
    chat.postme.passwordRequired = false
    chat.postme.dateActive = new Date()

    if (options.password) {
      chat.postme.passwordRequired = true
      chat.postme.password = await hashPassword(options.password)
    }
    
    await chat.save()

    if (options.totalParsing) {
      redisClient.emitter.emit('adding', {
        action: 'scrapChat',
        chatId: chat.chatID,
        userbotExist: true
      })
    }
    return 'Чат добавлен в базу данных'
  }
}

function returnMsgId(ctx) {
  if ( !ctx ) {
    return 0
  }
  const msgChannel = ctx.message ? ctx.message.message_id : false
  const msgGroup = ctx.channelPost ? ctx.channelPost.message_id : false
  return msgGroup || msgChannel
}

module.exports = {
  dlMongoListener,
  addDelorianModel,
  respectMongoListener,
  articleMongoListener,
  updateArticleResources,
  userMongoListener,
  postmeMongoListener,
  addChatMongoListener,
  adminMongoListener
}
