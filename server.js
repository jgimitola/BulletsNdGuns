var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

//Servimos los archivos necesarios.
app.use(express.static(__dirname + '/public'));
app.use('/js', express.static(__dirname + '/node_modules/socket.io-client/dist'));
app.use('/js', express.static(__dirname + '/node_modules/phaser/dist'));

//Ruta principal.
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

//Si alguien accede a otra ruta diferente al home, se le redirigirá.
app.get('*', function (req, res) {
    res.redirect('/');
});

console.log("Servidor Iniciado....");

http.listen(port, () => {
    console.log('Escuchano en' + port);
});

var jugadores = [];
var jugadoresListos = 0;

//Funciones variadas.

function eliminarJugador(socket) {
    jugadores.splice(jugadores.indexOf(socket), 1);
}

//Respondemos a las peticiones (POR HACER).

io.on('connection', function (socket) {
    jugadores.push(socket);
    io.emit('actNumJugadores', jugadores.length);
    console.log('Nuevo jugador: ' + socket.id);
    socket.on('disconnect', function () {
        eliminarJugador(socket);
        io.emit('actNumJugadores', jugadores.length);
        console.log('Jugador desconectado: ' + socket.id);
    });
});