class gameOver extends Phaser.Scene {

    constructor() {
        super('gameover');
    }

    create() {
        var jugadoresID = [];
        var puntajes = [];

        //Vectorizamos el JSON.
        Object.keys(jugadores).forEach(function (id) {
            var jugador = jugadores[id];
            jugadoresID.push(jugador.id);
            puntajes.push(jugador.puntaje);
        });

        //Organizamos los vectores en paralelo.
        for (let i = 0; i < puntajes.length; i++) {
            for (let j = 0; j < puntajes.length - i; j++) {
                if (puntajes[j] < puntajes[j + 1]) {
                    let tmpP = puntajes[j];
                    puntajes[j] = puntajes[j + 1];
                    puntajes[j + 1] = tmpP;
                    let tmpID = jugadoresID[j];
                    jugadoresID[j] = jugadoresID[j + 1];
                    jugadoresID[j + 1] = tmpID;
                }
            }
        }

        //Determinamos si existe un empate.
        var puntajeMayor = puntajes[0];
        var empate = false;
        if (puntajeMayor === jugadores[socket.id].puntaje) {
            for (let i = 1; i < puntajes.length; i++) {
                if (puntajes[i] === puntajeMayor) {
                    empate = true;
                }
            }
        }

        //Mostramos el texto correspondiente.
        if (empate) {
            this.add.text(400, 300, 'EMPATADO', { fontSize: '32px', fill: '#ffffff' }).setOrigin(0.5, 0.5);
        } else {
            if (socket.id === jugadoresID[0]) {
                this.add.text(400, 300, 'GANASTE', { fontSize: '32px', fill: '#00ff0d' }).setOrigin(0.5, 0.5);
            } else {
                this.add.text(400, 300, 'PERDISTE', { fontSize: '32px', fill: '#ff0000' }).setOrigin(0.5, 0.5);
            }
        }
    }
}