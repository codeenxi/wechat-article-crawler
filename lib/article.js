var serverUrl = 'http://{$IP}:9000';
var socket = io(serverUrl+'/wechat').connect(serverUrl);

socket.on('success', function () {
    $('#js_content').html("<label style='font-size: 30px;color:green'>提交成功</label>");
});

socket.on('url', function (data) {
    window.location = data.url;
});

socket.on('end', function (data) {
    alert('该公众号爬取完毕');
});

socket.on('connect', function () {
});
