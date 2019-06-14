const AnyProxy = require('anyproxy');
const Koa = require('Koa');
const http = require('http');
const Router = require('koa-router');
const fs = require('fs');
const ip = require('ip').address();
const path = require('path');
const moment = require('moment');
const rules = require('./lib/rule');

function resolve(url) {
    return path.resolve(__dirname, url);
}
function mkdirsSync(dirname) {
    if (fs.existsSync(dirname)) {
        return true;
    } else {
        if (mkdirsSync(path.dirname(dirname))) {
            fs.mkdirSync(dirname);
            return true;
        }
    }
}
function WechatSpider(options) {
    this.totalCount = 'all'; // 默认是全部抓取
    this.crawSubArticle = false; // 是否抓取次文
    this.articles = [];
    this.index = 0;
    this.result = [];
    this.spiderAccount = ''; // 要抓取的公众号名称
    Object.assign(this, options);
}
WechatSpider.prototype.init = function () {
    this.getInjections();
    this.createServer();
    this.socketIOListener();
    this.createAnyProxyServer();
};

WechatSpider.prototype.start = function () {
    this.init();
    this.proxyServer.start();
};
/**
 * 创建本地服务、socket通信
 */
WechatSpider.prototype.createServer = function () {
    const app = this.app = new Koa();
    const server = this.server = http.createServer(this.app.callback());
    this.io = require('socket.io')(this.server);
    this.router = new Router();
   // error handle
    app.use(async function (ctx, next) {
        try {
            await next();
        } catch (e) {
            console.log('error', e, ctx);
            app.emit('error', e, ctx);
        }
    });

    app.use(require('koa2-cors')());
    this.router.get('/', async (ctx, next) => {
        ctx.body = fs.readFileSync(resolve('./result.html'), 'utf-8');
    });
    app.use(this.router.routes());
    server.listen(9000);
    require("openurl").open("http://localhost:9000");
};
WechatSpider.prototype.socketIOListener = function () {
    const wechatIo = this.wechatIo = this.io.of('/wechat');
    this.resultIo = this.io.of('/result');
    wechatIo.on('connection', (function (socket) {
    }).bind(this));
};

WechatSpider.prototype.createAnyProxyServer = function () {
    const options = {
        port: 8001,
        rule: this.createAnyProxyRules(),
        webInterface: {
            enable: true,
            webPort: 8002,
            wsPort: 8003,
        },
        throttle: 10000,
        forceProxyHttps: true,
        silent: true
    };

    const proxyServer = this.proxyServer = new AnyProxy.ProxyServer(options);

    proxyServer.on('ready', () => {
        console.log('-------------------------- start... 等待公众号接入... --------------------------------');
    });
    proxyServer.on('error', (e) => {
        // 发生错误后自动重启
        proxyServer.start();
    });
};
//插入jquery
WechatSpider.prototype.injectJquery = function(body) {
    return body.replace(/<\/head>/g, '<script src="https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js"></script>'
        + '<script src="https://cdn.bootcss.com/socket.io/2.0.4/socket.io.js"></script></head>')
};
/**
 * 需要注入的内容
 * @param body
 * @returns Object
 */
WechatSpider.prototype.getInjections = function(body) {
    const injectJsFile = fs.readFileSync(resolve('./lib/list.js'), 'utf-8').replace('{$IP}', ip);
    const articleInjectJsFile = fs.readFileSync(resolve('./lib/article.js'), 'utf-8').replace('{$IP}', ip);
    const injectJs = `<script id="injectJs" type="text/javascript">${injectJsFile}</script>`;
    const articleInjectJs = `<script id="injectJs" type="text/javascript">${articleInjectJsFile}</script>`;
    const fakeImg = fs.readFileSync(resolve('./fake.png'));
    const resultIndexTpl = fs.readFileSync(resolve('./template/index.html'), 'utf-8');
    const resultTpl = fs.readFileSync(resolve('./template/result.html'), 'utf-8');
    return this.getInjections = {
        injectJsFile,
        injectJs,
        articleInjectJs,
        fakeImg,
        resultIndexTpl,
        resultTpl
    }
};
/**
 * 创建 中间人攻击 代理规则
 * @returns {*}
 */
WechatSpider.prototype.createAnyProxyRules = function () {
    return rules.call(this);
};
/**
 * 开始抓取文章详情页
 */
WechatSpider.prototype.startFetchArticle = function () {
    setTimeout(() => {
        const article = this.articles[this.index];
        if (article && this.index <= this.totalCount - 1) {
            console.log('正在抓取第' + (this.index + 1) + '篇文章');
            this.wechatIo.emit('url', {url: article.content_url, index: this.index, total: this.articles.length});
        } else {
            this.end();
        }
    }, 1000);
};
/**
 * 检查字段是否抓全,如果抓取全了，则下一个
 * @param obj
 * @returns {boolean}
 */
WechatSpider.prototype.checkAndToNext = function (obj) {
    if ('read_num' in obj && 'like_num' in obj) {
        this.resultIo.emit('newData', { ...obj, account_name: this.spiderAccount });
        this.index++;
        this.startFetchArticle();
        // 通知浏览器，添加新数据
    } else {
        this.startFetchArticle();
    }
};
/**
 * 保存爬取的结果
 * @param cb
 */
WechatSpider.prototype.saveResult = function (cb) {
    mkdirsSync(resolve('./data/' + this.spiderAccount));
    fs.writeFileSync(resolve('./data/' + this.spiderAccount + '/index.html'),
        this.getInjections.resultIndexTpl.replace(/{\$accountName}/g, this.spiderAccount));
    fs.writeFileSync(resolve('./data/' + this.spiderAccount + '/result.html'), this.getInjections.resultTpl);
    fs.writeFile(resolve('./data/' + this.spiderAccount + '/data.js'), 'var result =' + JSON.stringify(this.result),
        function (err) {
        if(err) {
            console.error(err);
        } else {
            console.log('保存成功');
            cb && cb();
        }
    });
};
/**
 * 爬取完毕
 * 结束爬虫
 */
WechatSpider.prototype.end = function () {
    this.wechatIo.emit('end', {});
    console.log('文章爬取完毕...内容正在保存中..');
    this.saveResult(() => {
        console.log('保存成功');
        require("openurl").open(resolve('./data/' + this.spiderAccount + '/index.html'));
        setTimeout(() => {
            this.proxyServer.close(); // 结束anyProxy代理
            process.exit(); // 结束node进程
        }, 3000);
    });
};

// const spider = new WechatSpider({
//     totalCount: 100,
//     crawSubArticle: false
// });
// spider.start();

module.exports = WechatSpider;