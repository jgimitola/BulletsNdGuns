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
    if (!partidaEnProceso) {
        res.sendFile(__dirname + '/index.html');
    } else {
        res.sendFile(__dirname + '/matchInProgress.html');
    }
});

//Si alguien accede a otra ruta diferente al home, se le redirigirá.
app.get('*', function (req, res) {
    res.redirect('/');
});

console.log("Servidor Iniciado....");

http.listen(port, () => {
    console.log('Escuchando en ' + port);
});

var jugadores = {};
var coleccionables = require('./coleccionables.json');
var numJugadores = 0;
var jugadoresListos = 0;
var partidaEnProceso = false;

//Funciones variadas.
function eliminarJugador(socket) {
    if (jugadores[socket.id].listo) {
        jugadoresListos--;
    }
    numJugadores--;
    delete jugadores[socket.id];
    if (numJugadores === 0) {
        partidaEnProceso = false;
    }
    if (jugadoresListos === numJugadores && !partidaEnProceso) {
        io.emit('iniciar', true);
    }
}

function añadirJugador(socket) {
    numJugadores++;
    if (numJugadores % 2 !== 0) {
        jugadores[socket.id] = {
            id: socket.id,
            x1: 13,
            y1: 514,
            x2: 96,
            y2: 546,
            xf: 64,
            yf: 540,
            flipped: false,
            anim: 'quieto',
            puntaje: 0,
            listo: false
        }
    } else {
        jugadores[socket.id] = {
            id: socket.id,
            x1: 803,
            y1: 514,
            x2: 709,
            y2: 543,
            xf: 736,
            yf: 540,
            flipped: true,
            anim: 'quieto',
            puntaje: 0,
            listo: false
        }
    }
}

io.on('connection', function (socket) {
    añadirJugador(socket);
    socket.emit('actColeccionables', coleccionables);
    io.emit('actNumJugadores', numJugadores);
    io.emit('jugadoresActuales', jugadores);
    socket.broadcast.emit('nuevoJugador', jugadores[socket.id]);
    console.log('Nuevo jugador: ' + socket.id);

    socket.on('disconnect', function () {
        eliminarJugador(socket);
        io.emit('actNumJugadores', numJugadores);
        io.emit('jugadoresActuales', jugadores);
        io.emit('jugadorDesconectado', socket.id)
        console.log('Jugador desconectado: ' + socket.id);
    });

    socket.on('jugadorListo', function () {
        if (!jugadores[socket.id].listo) {
            jugadores[socket.id].listo = true;
            jugadoresListos++;
            if (numJugadores > 1 && jugadoresListos === numJugadores) {
                partidaEnProceso = true;
                io.emit('iniciar', true);
            }
        }
    });

    socket.on('reiniciarPos', function (id) {
        io.to(id).emit('reSpawn');
    });

    socket.on('disparo', function (info) {
        socket.broadcast.emit('disparar', info);
    });

    socket.on('movJugador', function (infoMovimiento) {
        jugadores[socket.id].x1 = infoMovimiento.x;
        jugadores[socket.id].y1 = infoMovimiento.y;
        jugadores[socket.id].flipped = infoMovimiento.flipped;
        jugadores[socket.id].anim = infoMovimiento.anim;
        socket.broadcast.emit('movimiento', jugadores[socket.id]);
    });

    socket.on('movJugador2', function (infoMovimiento) {
        jugadores[socket.id].x2 = infoMovimiento.x;
        jugadores[socket.id].y2 = infoMovimiento.y;
        jugadores[socket.id].flipped = infoMovimiento.flipped;
        jugadores[socket.id].anim = infoMovimiento.anim;
        socket.broadcast.emit('movimiento', jugadores[socket.id]);
    });
    socket.on('movJugadorF', function (infoMovimiento) {
        jugadores[socket.id].xf = infoMovimiento.x;
        jugadores[socket.id].yf = infoMovimiento.y;
        jugadores[socket.id].flipped = infoMovimiento.flipped;
        jugadores[socket.id].anim = infoMovimiento.anim;
        socket.broadcast.emit('movimiento', jugadores[socket.id]);
    });

    socket.on('monedaRecolectada', function (id) {
        jugadores[socket.id].puntaje += 1;
        socket.broadcast.emit('eliminarMoneda', id);
    });

    socket.on('balaRecolectada', function (id) {
        socket.broadcast.emit('eliminarBala', id);
    });

    socket.on('port1', function () {
        io.emit('jugadoresActuales', jugadores);
        io.emit('1LF');
    });

    socket.on('port2', function () {
        io.emit('jugadoresActuales', jugadores);
        io.emit('2LF');
    });

    socket.on('portF', function () {
        io.emit('jugadoresActuales', jugadores);
        io.emit('FLF');
    });
});