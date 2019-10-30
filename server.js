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
    console.log("Escuchando en puerto " + port + " ...");
});

var jugadores = [];

//Funciones variadas.

function eliminarJugador(id) {
    jugadores.splice(jugadores.indexOf(id), 1);
}

//Respondemos a las peticiones (POR HACER).

io.on('connection', function (socket) {
    jugadores.push(socket.id);
    console.log('Nuevo jugador: ' + socket.id);
    socket.on('disconnect', function () {
        eliminarJugador(socket.id);
        console.log('Jugador desconectado: ' + socket.id);
    });
});



