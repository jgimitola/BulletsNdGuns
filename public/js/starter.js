var socket = io();
var jugadores = {};
var numJugadores = 0;
var coleccionables = {};

socket.on('jugadoresActuales', (jugadoresServer) => {
    jugadores = jugadoresServer;
});

socket.on('actNumJugadores', (data) => {
    numJugadores = data;
});

socket.on('actColeccionables', (col) => {
    coleccionables = col;
});