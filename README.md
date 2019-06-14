# 基于anyproxy的微信公众号爬虫

## 基本原理
1. [AnyProxy](http://anyproxy.io/cn/)是一个阿里开源的HTTP代理服务器，可提供了二次开发能力，可以编写js代码改变http/https请求和响应
2. 首先就是获取要爬取的全部文章，然后一篇一篇去打开获取文章标题，作者，阅读数，点赞数，评论数（阅读点赞数只能在微信app内置浏览器获取）
3. 点击公众号"全部消息"，打开这个网页不停下拉，可以查到全部发布文章。在这一步，基于anyproxy，禁调内容安全策略，修改了这个网页html，注入一段让页面不停往下滚动的js脚本，当滚到底部，就获取了全部文章列表。 本质上是中间人攻击。
4. 获取完全部文章的概要内容后，下一步循环通知微信浏览器一个一个去打开这些文章详情页。每个文章网页也注入js脚本，控制下一个页面的跳转，通过anyproxy，结合正则匹配 点赞、阅读、评论的接口。数据获取成功后就通知微信浏览器打开下一个url。这里使用了socketio，实现微信浏览器和自建的koa服务器之间的通讯。

## 实践过程的注意点

原理很简单，基于真机的爬虫，中间人攻击，注入javascript脚本，让浏览器模拟人的操作过程。

1. 禁止网页的Content-Security-Policy。CSP 的实质就是白名单制度，开发者明确告诉客户端，哪些外部资源可以加载和执行，等同于提供白名单。如果不禁用，注入的javascript将无法执行。
``` javascript
 // 删除微信网页的安全策略
delete header['Content-Security-Policy'];
delete header['Content-Security-Policy-Report-Only'];
```

2. 禁止微信浏览器缓存页面内容，同样要修改响应头的和缓存相关的内容。
```javascript
 header['Expires'] = 0;
 header['Cache-Control'] = 'no-cache, no-store, must-revalidate';
```