var socket = io();
var numJugadores = 0;

socket.on('actNumJugadores', (data) => {
    numJugadores = data;
});