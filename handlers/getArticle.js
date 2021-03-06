const Extra = require('telegraf/extra')
const {articleMongoListener, updateArticleResources} = require('../DB/mongo/mongoListener')
const articleParser = require('../utils/articleParser')

function random(arr) {
  return arr[Math.floor(Math.random() * (arr.length - 0)) + 0]
}

// Refresh article resources
setInterval( () => {
  updateArticleResources()
}, 1000 * 60 * 60 * random( [1, 2, 3] ))

module.exports = async (ctx) => {
  try {

    const articleResource = ctx.match[ctx.match.length-1].toLowerCase()

    if ( articleResource === 'хакер' ) {
      const articlesArr = await articleMongoListener(articleResource, articleParser.xakepParser)
      return ctx.reply(random(articlesArr).link)
    }

    if ( articleResource === 'код дурова' || articleResource === 'код' ) {
      const articlesArr = await articleMongoListener(articleResource, articleParser.kodParser)
      return ctx.reply(random(articlesArr))
    }

    if(articleResource === 'comss' || articleResource === 'комсс'){
      const articlesArr = await articleMongoListener(articleResource, articleParser.comssParser)
      return ctx.reply(random(articlesArr).link)
    }

    if(articleResource === 'list' || articleResource === 'список'){
      return ctx.reply(`<b>Список доступных ресурсов:</b>\n1. "код" или "код дурова".\n2. "хакер".\n3. "комсс" или "comss".`, Extra.HTML(true))
    }
    ctx.reply(`Нет статей по запросу <b>"${articleResource}"</b>`, Extra.HTML(true))
  } catch (error) {
    console.error(error.message)
  }
}

// TODO
// - Cycle of displaying articles, iterating over the array in a circle
