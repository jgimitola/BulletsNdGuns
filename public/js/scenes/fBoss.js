class fBoss extends Phaser.Scene {
    constructor() {
        super("fB");
        //Posiciones iniciales.
        this.x0;
        this.y0;
        //Velocidades jugador.
        this.velX = 270;
        this.velY = -525;
    }

    //Crea el jugador principal.
    crearJugador(jugTemp) {
        var newJugador = this.physics.add.sprite(jugTemp.xf, jugTemp.yf, 'jugador');
        this.x0 = jugTemp.xf;
        this.y0 = jugTemp.yf;
        newJugador.setOrigin(0.5, 0.5);
        newJugador.setScale(2.3, 2.3);
        newJugador.body.setSize(12, 15).setOffset(2, 8);
        newJugador.setCollideWorldBounds(true);
        if (jugTemp.flipped) {
            newJugador.flipX = true;
            newJugador.setOffset(12, 8);
        }
        newJugador.play('quieto', true);
        newJugador.id = jugTemp.id;
        return newJugador;
    }

    //Crea a los demás jugadores.
    crearJugadores(jugTemp) {
        var newJugador = this.add.sprite(jugTemp.xf, jugTemp.yf, 'enemigo');
        newJugador.setOrigin(0.5, 0.5);
        newJugador.setScale(2.3, 2.3);
        if (jugTemp.flipped) {
            newJugador.flipX = true;
            newJugador.x -= newJugador.width;
        } else {
            newJugador.x += newJugador.width / 2;
        }
        newJugador.play('quietoE', true);
        newJugador.id = jugTemp.id;
        return newJugador;
    }

    //Recorre el JSON de jugadores, los crea y los pinta.
    pintarJugadores(self) {
        Object.keys(jugadores).forEach(function (id) {
            if (jugadores[id].id !== socket.id) {
                self.jugadores.add(self.crearJugadores(jugadores[id]));
            }
        });
    }

    aumentarPuntos(jugador, moneda) {
        socket.emit('monedaRecolectada', moneda.id);
        this.monedas.remove(moneda);
        moneda.destroy();
        this.contMonedas += 1;
    }

    aumentarBalas(jugador, bala) {
        socket.emit('balaRecolectada', bala.id);
        this.balas.remove(bala);
        bala.destroy();
        this.contBalas += 1;
    }

    create() {
        //Guardamos la referencia de ESTA escena.
        var self = this;
        //Contadores.
        this.contBalas = 2;
        this.contMonedas = 0;
        //Scores de balas y monedas.
        this.textBalas = this.add.text(2, 0, 'Munición: ' + this.contBalas);
        this.textMonedas = this.add.text(2, 12, 'Monedas: ' + this.contMonedas);
        //Fondo.
        this.cameras.main.setBackgroundColor('rgba(250, 143, 67)');
        //Grupo de jugadores.
        this.jugadores = this.add.group();
        //Añadimos jugador principal.
        this.jugador = this.crearJugador(jugadores[socket.id]);
        //Añadimos otros jugadores.
        this.pintarJugadores(this);
        //Cargamos el mapa.
        this.mapa = this.make.tilemap({
            key: 'map3'
        });
        this.tileset = this.mapa.addTilesetImage('p1LevelTS', 'tiles');
        this.platforms = this.mapa.createStaticLayer('Plataformas', this.tileset, 0, 0)
        this.platforms.setCollisionByExclusion(-1, true);
        this.physics.add.collider(this.jugador, this.platforms);
        //Creamos balas.
        this.balas = this.physics.add.group({
            allowGravity: false,
            immovable: true
        });
        Object.keys(coleccionables.balasf).forEach(function (id) {
            const tempBala = coleccionables.balasf[id];
            const bala = self.balas.create(tempBala.x, tempBala.y - 30, 'bala').setOrigin(0, 0);
            bala.body.setSize(10, 30);
            bala.id = tempBala.id;
        });

        //Creamos monedas.
        this.monedas = this.physics.add.group({
            allowGravity: false,
            immovable: true
        });
        Object.keys(coleccionables.monedasf).forEach(function (id) {
            const tempMoneda = coleccionables.monedasf[id];
            const moneda = self.monedas.create(tempMoneda.x, tempMoneda.y - 30, 'moneda').setOrigin(0, 0);
            moneda.body.setSize(25, 23);
            moneda.id = tempMoneda.id;
        });

        //Creamos portal.
        this.portal = this.physics.add.image(416, 60, 'portal');
        this.portal.body.setAllowGravity(false);
        this.portal.body.setSize(this.portal.width - 20, this.portal.height);

        //Colision jugador con monedas o balas (Coleccionables).
        this.physics.add.overlap(this.jugador, this.monedas, this.aumentarPuntos, null, this);
        this.physics.add.overlap(this.jugador, this.balas, this.aumentarBalas, null, this);
        this.physics.add.overlap(this.jugador, this.portal, () => {
            socket.emit('portF');
        }, null, this);

        //Creamos controles.
        this.controles = this.input.keyboard.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D,
            SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE
        });

        ///Eventos de socket.
        socket.on('jugadorDesconectado', function (idEliminar) {
            if (!nivelFF) {
                self.jugadores.getChildren().forEach(function (jugTemp) {
                    if (idEliminar === jugTemp.id) {
                        jugTemp.destroy();
                    }
                });
            }
        });

        socket.on('movimiento', function (jugTemp) {
            if (!nivelFF) {
                self.jugadores.getChildren().forEach(function (jugMovido) {
                    if (jugTemp.id === jugMovido.id) {
                        jugMovido.setPosition(jugTemp.xf, jugTemp.yf);
                        jugMovido.flipX = jugTemp.flipped;
                        jugMovido.play(jugTemp.anim + "E", true);
                    }
                });
            }
        });

        socket.on('eliminarMoneda', function (id) {
            if (!nivelFF) {
                self.monedas.getChildren().forEach(function (moneda) {
                    if (moneda.id === id) {
                        self.monedas.remove(moneda);
                        moneda.destroy();
                    }
                });
            }
        });

        socket.on('eliminarBala', function (id) {
            if (!nivelFF) {
                self.balas.getChildren().forEach(function (bala) {
                    if (bala.id === id) {
                        self.balas.remove(bala);
                        bala.destroy();
                    }
                });
            }
        });
        socket.on('FLF', function () {
            nivelFF = true;
            self.scene.start('gameOver');
        });

    }

    update() {
        //Actualizamos contadores.
        this.textBalas.setText('Munición: ' + this.contBalas);
        this.textMonedas.setText('Monedas: ' + this.contMonedas);
        if (this.jugador.flipX) {
            this.jugador.body.setOffset(12, 8);
        } else {
            this.jugador.body.setSize(12, 15).setOffset(2, 8);
        }
        //Animacion
        if (this.jugador.body.onFloor()) {
            if (this.jugador.body.velocity.x === 0) {
                this.jugador.play('quieto', true);
            } else {
                this.jugador.play('correr', true);
            }
        } else {
            if (this.jugador.body.velocity.y > 0) {
                this.jugador.play('caer', true);
            } else {
                this.jugador.play('brincar', true);
            }
        }
        //Movemos al jugador.  
        if (this.controles.W.isDown && this.jugador.body.onFloor()) {
            this.jugador.setVelocityY(this.velY);
        }
        if (this.controles.A.isDown) {
            this.jugador.setVelocityX(this.velX * -1);
            this.jugador.flipX = true;
        } else if (this.controles.D.isDown) {
            this.jugador.setVelocityX(this.velX);
            this.jugador.flipX = false;
        } else {
            this.jugador.setVelocityX(0);
        }
        //Enviamos movimiento.        
        var x = this.jugador.x;
        var y = this.jugador.y;
        if (this.jugador.dataMovimiento && (x !== this.jugador.dataMovimiento.x || y !== this.jugador.dataMovimiento.y)) {
            socket.emit('movJugadorF', { x: this.jugador.x, y: this.jugador.y, flipped: this.jugador.flipX, anim: this.jugador.anims.getCurrentKey() });
        }
        this.jugador.dataMovimiento = {
            x: this.jugador.x,
            y: this.jugador.y
        };
    }
}