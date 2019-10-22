var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

//Servimos los archivos necesarios.
app.use(express.static(__dirname + '/public'));
app.use('/js', express.static(__dirname + '/node_modules/socket.io-client/dist'));
app.use('/js', express.static(__dirname + '/node_modules/phaser/dist'));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('*', function (req, res) {
    res.redirect('/');
});

//Respondemos a las peticiones (POR HACER).

console.log("Servidor Iniciado....");

http.listen(port, () => {
    console.log("Escuchando en puerto " + port + " ...");
});

