module.exports = function getRules() {
    const that = this;
    const injections = this.getInjections;
    return  {
        summary: 'wechat articles crawler',
        *beforeSendRequest(requestDetail) {
            // 如果请求图片，直接返回一个本地图片，提升性能
            let accept = requestDetail.requestOptions.headers['Accept'];
            if (accept && accept.indexOf('image') !== -1 && (/jpg|jpeg|gif|png|svg/g).test(requestDetail.url)) {
                // accept && accept.indexOf('image') !== -1 && requestDetail.url.indexOf('mmbiz.qpic.cn/') !== -1
                return {
                    response: {
                        statusCode: 200,
                        header: {'content-type': 'image/png'},
                        body: injections.fakeImg
                    }
                };
            }
        },
        *beforeSendResponse(requestDetail, responseDetail) {
            // 全部消息文章列表
            if (requestDetail.url.indexOf('mp.weixin.qq.com/mp/profile_ext?') !== -1 && requestDetail.requestOptions.method === 'GET') {
                console.log('get  profile_ext', responseDetail.response.header['Content-Type']);
                const newResponse = responseDetail.response;
                let body = responseDetail.response.body.toString();
                let can_msg_continue = true;
                let newAdd = [];
                // 首次请求网页
                if (responseDetail.response.header['Content-Type'].indexOf('text/html') !== -1) {
                    let msgReg = /var msgList = \'(.*?)\';/;
                    let execBody = msgReg.exec(body)[1];
                    let msgList = JSON.parse(execBody.replace(/&quot;/g, '"'));
                    msgList.list.forEach((v, i) => {
                        if (v.app_msg_ext_info) {
                            // 文章没有被删除，并且是图文消息
                            v.app_msg_ext_info.del_flag != 4 && v.app_msg_ext_info.content_url && newAdd.push(
                                Object.assign({}, v.app_msg_ext_info, v.comm_msg_info)
                            );
                            if (that.crawSubArticle) {
                                let subList = (v.app_msg_ext_info && v.app_msg_ext_info.multi_app_msg_item_list) || [];
                                subList.forEach(v1 => {
                                    v1.del_flag != 4 && v1.content_url && newAdd.push(
                                        Object.assign({}, v1, v.comm_msg_info)
                                    )
                                })
                            }

                        }
                    });
                    newResponse.body = that.injectJquery(body).replace(/<\/body>/g, injections.injectJs + '</body>');
                    let header = Object.assign({}, responseDetail.response.header);
                    // 删除微信的安全策略，禁止缓存
                    delete header['Content-Security-Policy'];
                    delete header['Content-Security-Policy-Report-Only'];
                    header['Expires'] = 0;
                    header['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                    newResponse.header = header;
                } else {
                    // ajax POST请求 加载更多文章列表
                    can_msg_continue = body.indexOf('can_msg_continue":1') !== -1;
                    let regList = /general_msg_list":"(.*)","next_offset/;
                    let list = regList.exec(body)[1];
                    let reg = /\\"/g;
                    let general_msg_list = JSON.parse(list.replace(reg, '"'));
                    general_msg_list.list.forEach((v, i) => {
                        if (v.app_msg_ext_info) {
                            //只爬取头条
                            v.app_msg_ext_info.del_flag != 4 && v.app_msg_ext_info.content_url && newAdd.push(
                                Object.assign({}, v.app_msg_ext_info, v.comm_msg_info)
                            );
                            if (that.crawSubArticle) {
                                let subList = (v.app_msg_ext_info && v.app_msg_ext_info.multi_app_msg_item_list) || [];
                                subList.forEach(v1 => {
                                    v1.del_flag != 4 && v1.content_url && newAdd.push(
                                        Object.assign({}, v1, v.comm_msg_info)
                                    )
                                })
                            }
                        }
                    });
                }

                newAdd.forEach(v => {
                    v.content_url = v.content_url.replace(/amp;/g, '').replace(/\\\//g, '/').replace('#wechat_redirect', '');
                });

                if (that.articles.length <= that.totalCount) {
                    that.articles = that.articles.concat(newAdd);
                    console.log('获取文章的列表总数articles.length ', that.articles.length);
                }
                // 如果全部加载完毕或者达到了设定的最大抓取数，则开始抓取文章详情
                if (!can_msg_continue || that.articles.length >= that.totalCount) {
                    if (!can_msg_continue && that.totalCount === 'all') {
                        // 如果没有配置最大抓取数量，则抓取公众号所有文章列表
                        this.totalCount = that.articles.length;
                    }
                    that.startFetchArticle();
                }
                return {response: newResponse};// 返回修改后的请求结果

            }  else if (requestDetail.url.indexOf('mp.weixin.qq.com/s?') !== -1 && requestDetail.requestOptions.method == 'GET') {
                // 文章页面注入js 接收 要抓取的url
                const newResponse = responseDetail.response;
                let body = responseDetail.response.body.toString();
                if (!that.spiderAccount) {
                    var reg = /<strong class=\"profile_nickname\">(.*?)<\/strong>/; // 补获公众号名称
                    var ret = reg.exec(body);
                    if (ret && ret[1]) {
                        that.spiderAccount = ret[1];
                    }
                }
                newResponse.body = that.injectJquery(body).replace(/\s<\/body>\s/g, injections.articleInjectJs + '</body>');
                let header = Object.assign({}, responseDetail.response.header);
                // 删除微信的安全策略，禁止缓存
                delete header['Content-Security-Policy'];
                delete header['Content-Security-Policy-Report-Only'];
                header['Expires'] = 0;
                header['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                newResponse.header = header;
                return {response: newResponse};
            } else if (requestDetail.url.indexOf('mp.weixin.qq.com/mp/getappmsgext?') !== -1 && requestDetail.requestOptions.method == 'POST') {
                // 阅读，点赞获取
                const newResponse = responseDetail.response;
                let body = responseDetail.response.body.toString();
                const data = JSON.parse(body).appmsgstat;
                if (that.index < that.totalCount) {
                    if (data) {
                        if (!that.result[that.index]) {
                            that.result.push(Object.assign(that.articles[that.index], data));
                        } else {
                            that.result[that.index] = {
                                ...that.result[that.index],
                                ...data
                            };
                        }
                        that.checkAndToNext(that.result[that.index]);
                    } else {
                        that.startFetchArticle();
                    }
                }
                return {response: newResponse};

            } else if (/mp\/appmsg_comment\?action=getcommen/i.test(requestDetail.url)) {
                // 评论获取
                const newResponse = responseDetail.response;
                const body = newResponse.body.toString();
                try {
                    var appmsgComment = JSON.parse(body);
                    if (that.index < that.totalCount) {
                        if (appmsgComment.elected_comment) {
                            if (!that.result[that.index]) {
                                that.result.push(Object.assign(that.articles[that.index], {
                                    elected_comment: appmsgComment.elected_comment
                                }));
                            } else {
                                that.result[that.index] = {
                                    ...that.result[that.index],
                                    elected_comment: appmsgComment.elected_comment
                                };
                            }
                            that.checkAndToNext(that.result[that.index]);
                        } else {
                            that.startFetchArticle();
                        }
                    }
                } catch (e) {
                    console.log(e);
                }
                return {response: newResponse};
            }

        },
        *beforeDealHttpsRequest(requestDetail) {
            return true;
        },
    }
};