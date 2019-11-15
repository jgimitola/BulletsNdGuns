var socket = io();
var jugadores = {};
var nivel1F = false;
var nivel2F = false;
var nivelFF = false;
var coleccionables = {};

socket.on('jugadoresActuales', (jugadoresServer) => {
    jugadores = jugadoresServer;
});

socket.on('actColeccionables', (col) => {
    coleccionables = col;
});