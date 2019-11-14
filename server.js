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
var coleccionables = {
    balas1: {
        b1: {
            id: 1,
            x: 416,
            y: 540
        },
        b2: {
            id: 2,
            x: 352,
            y: 540
        },
        b3: {
            id: 3,
            x: 384,
            y: 540
        },
        b4: {
            id: 4,
            x: 256,
            y: 90
        },
        b5: {
            id: 5,
            x: 768,
            y: 390
        },
        b6: {
            id: 6,
            x: 0,
            y: 390
        }
    },
    monedas1: {
        m1: {
            id: 1,
            x: 704,
            y: 540
        },
        m2: {
            id: 2,
            x: 64,
            y: 540
        },
        m3: {
            id: 3,
            x: 384,
            y: 360
        },
        m4: {
            id: 4,
            x: 384,
            y: 390
        },
        m5: {
            id: 5,
            x: 384,
            y: 420
        },
        m6: {
            id: 6,
            x: 224,
            y: 480
        },
        m7: {
            id: 7,
            x: 544,
            y: 480
        },
        m8: {
            id: 8,
            x: 160,
            y: 210
        },
        m9: {
            id: 9,
            x: 608,
            y: 210
        },
        m10: {
            id: 10,
            x: 384,
            y: 90
        },
        m11: {
            id: 11,
            x: 448,
            y: 90
        },
        m12: {
            id: 12,
            x: 512,
            y: 90
        },
    },
    balas2: {

    },
    monedas2: {

    },
    balasf: {

    },
    monedasf: {

    }
};
var numJugadores = 0;
var jugadoresListos = 0;
var partidaEnProceso = false;

//Funciones variadas.

function eliminarJugador(socket) {
    numJugadores--;
    delete jugadores[socket.id];
    if (numJugadores === 0) {
        partidaEnProceso = false;
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
            xf: 384,
            yf: 66,
            flipped: false,
            anim: 'quieto'
        }
    } else {
        jugadores[socket.id] = {
            id: socket.id,
            x1: 803,
            y1: 514,
            x2: 736,
            y2: 543,
            xf: 544,
            yf: 63,
            flipped: true,
            anim: 'quieto'
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
        jugadoresListos--;
        eliminarJugador(socket);
        io.emit('actNumJugadores', numJugadores);
        io.emit('jugadoresActuales', jugadores);
        io.emit('jugadorDesconectado', socket.id)
        console.log('Jugador desconectado: ' + socket.id);
    });

    socket.on('jugadorListo', function () {
        jugadoresListos++;
        if (numJugadores > 1 && jugadoresListos === numJugadores) {
            partidaEnProceso = true;
            io.emit('iniciar', true);
        }
    });

    socket.on('movJugador', function (infoMovimiento) {
        jugadores[socket.id].x1 = infoMovimiento.x;
        jugadores[socket.id].y1 = infoMovimiento.y;
        jugadores[socket.id].flipped = infoMovimiento.flipped;
        jugadores[socket.id].anim = infoMovimiento.anim;
        socket.broadcast.emit('movimiento', jugadores[socket.id]);
    });
});