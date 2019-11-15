var socket = io();
var jugadores = {};
var numJugadores = 0;
var nivel1F = false;
var nivel2F = false;
var nivelFF = false;
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