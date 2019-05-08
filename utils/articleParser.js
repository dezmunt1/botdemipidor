const Osmosis = require('osmosis');
const axios = require('axios'); 
const RssParser = require('rss-parser')

const comssParser = () => {
    const funcName = 'comssParser';
    const URL = 'https://zapier.com/engine/rss/646640/newscomss/';
    const rssParser = new RssParser();
    let artArr = [];
    return new Promise((res, rej)=>{
        let article = rssParser.parseURL(URL)
            .then(result => {
                res(result.items);
            })
            .catch(err => console.log(err));
    })
};


const kodParser = () => {
    const funcName = 'kodParser';
    const URL = 'https://kod.ru/tag/news/';
    let artArr = [];
    return new Promise((res, rej)=>{
        Osmosis
        .get(URL)
        .find('.post-card .box')
        .set({
            articles: '@href'
        })
        .data(item => {
            artArr.push(item);
        })
        .error(err => {
            rej(err);
        })
        .done(()=> {
            const resultArr = artArr.map( item => {
                return `https://kod.ru${item.articles}`
            })
            res(resultArr);
        })
    })
};

const xakepParser = () => {
    const funcName = 'xakepParser';
    const URL = encodeURI(`https://wrapapi.com/use/dezmunt1/xakep/news/0.0.5?wrapAPIKey=${process.env.WRAPAPI_TOKEN}`);
    return new Promise( (resolve, rej) => {
        axios({
            method:'post',
            url: URL
        })
            .then((respon) => {
                resolve(respon.data.data.news) ;
            })
            .catch( (error) => {
            console.log(error);
            });
    });
};

module.exports = {
    comssParser,
    kodParser,
    xakepParser
};
