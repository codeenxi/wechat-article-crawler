var scrollKey = setInterval(function () {
    window.scrollTo(0,document.body.scrollHeight);
},2000);

var serverUrl = 'http://{$IP}:9000';

var socket = io(serverUrl+'/wechat').connect(serverUrl);

socket.on('url', function (data) {
    clearInterval(scrollKey);
    window.location = data.url;
});