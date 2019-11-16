class p1Level extends Phaser.Scene {

    constructor() {
        super("p1L");
        //Posiciones iniciales.
        this.x0;
        this.y0;
        //Velocidades jugador.
        this.velX = 270;
        this.velY = -525;
    }

    //Crea el jugador principal.
    crearJugador(jugTemp) {
        var newJugador = this.physics.add.sprite(jugTemp.x1, jugTemp.y1, 'jugador');
        this.x0 = jugTemp.x1;
        this.y0 = jugTemp.y1;
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
        var newJugador = this.physics.add.sprite(jugTemp.x1, jugTemp.y1, 'enemigo');
        newJugador.setOrigin(0.5, 0.5);
        newJugador.setScale(2.3, 2.3);
        newJugador.body.setSize(12, 15).setOffset(2, 8);
        if (jugTemp.flipped) {
            newJugador.flipX = true;
            newJugador.setOffset(12, 8);
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

    eliminarBala(plat, bala) {
        bala.setVelocityX(0);
        bala.setPosition(10, -10);
    }

    balaFueraMudo() {
        var self = this;
        this.balasDisparadas.getChildren().forEach(function (bala) {
            if (bala.x < 0 || bala.x > 800) {
                self.eliminarBala(null, bala);
            }
        });
    }
    otraBalaFueraMudo() {
        var self = this;
        this.otrasBalasDisparadas.getChildren().forEach(function (bala) {
            if (bala.x < 0 || bala.x > 800) {
                self.eliminarBala(null, bala);
            }
        });
    }

    getBala() {
        var balita = null;
        this.balasDisparadas.getChildren().forEach(function (bala) {
            if (bala.x === 10 && bala.y === -10) {
                balita = bala;
            }
        });
        return balita;
    }
    getOtraBala() {
        var balita = null;
        this.otrasBalasDisparadas.getChildren().forEach(function (bala) {
            if (bala.x === 10 && bala.y === -10) {
                balita = bala;
            }
        });
        return balita;
    }

    create() {
        this.sfxSaltar = this.sound.add('saltar', {
            volume: 0.15,
            loop: false
        });
        this.sfxDisparar = this.sound.add('disparo', {
            volume: 0.15,
            loop: false
        });
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
        this.jugadores = this.physics.add.group({
            allowGravity: false
        });
        //Añadimos jugador principal.
        this.jugador = this.crearJugador(jugadores[socket.id]);
        //Añadimos otros jugadores.
        this.pintarJugadores(this);
        //Cargamos el mapa.
        this.mapa = this.make.tilemap({
            key: 'map'
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
        Object.keys(coleccionables.balas1).forEach(function (id) {
            const tempBala = coleccionables.balas1[id];
            const bala = self.balas.create(tempBala.x, tempBala.y - 30, 'bala').setOrigin(0, 0);
            bala.body.setSize(10, 30);
            bala.id = tempBala.id;
        });
        //Creamos monedas.
        this.monedas = this.physics.add.group({
            allowGravity: false,
            immovable: true
        });
        Object.keys(coleccionables.monedas1).forEach(function (id) {
            const tempMoneda = coleccionables.monedas1[id];
            const moneda = self.monedas.create(tempMoneda.x, tempMoneda.y - 30, 'moneda').setOrigin(0, 0);
            moneda.body.setSize(25, 23);
            moneda.id = tempMoneda.id;
        });

        //Balas.
        this.coolDown = 1000;
        this.tiempoUltDisparo = 0;
        this.balasDisparadas = this.physics.add.group({
            allowGravity: false
        });
        this.otrasBalasDisparadas = this.physics.add.group({
            allowGravity: false
        });
        for (let i = 0; i < 5; i++) {
            this.balasDisparadas.create(10, -10, 'balaD').setScale(1.5, 1.5);
        }
        for (let i = 0; i < 15; i++) {
            this.otrasBalasDisparadas.create(10, -10, 'balaD').setScale(1.5, 1.5);
        }

        //Creamos portal.
        this.portal = this.physics.add.image(704, 60, 'portal');
        this.portal.body.setAllowGravity(false);
        this.portal.body.setSize(this.portal.width - 20, this.portal.height);

        //Colision jugador con monedas o balas (Coleccionables).
        this.physics.add.collider(this.balasDisparadas, this.platforms, (bla, plat) => {
            this.eliminarBala(null, bla);
        }, null, this);
        this.physics.add.collider(this.otrasBalasDisparadas, this.platforms, (bla, plat) => {
            this.eliminarBala(null, bla);
        }, null, this);
        this.physics.add.overlap(this.jugadores, this.balasDisparadas, (j, b) => {
            this.eliminarBala(null, b);
            socket.emit('reiniciarPos', j.id);
        }, null, this);
        this.physics.add.overlap(this.jugadores, this.otrasBalasDisparadas, (j, b) => {
            this.eliminarBala(null, b);
        }, null, this);
        this.physics.add.overlap(this.jugador, this.otrasBalasDisparadas, (j, b) => {
            this.eliminarBala(null, b);
        }, null, this);
        this.physics.add.overlap(this.jugador, this.monedas, this.aumentarPuntos, null, this);
        this.physics.add.overlap(this.jugador, this.balas, this.aumentarBalas, null, this);
        this.physics.add.overlap(this.jugador, this.portal, () => {
            socket.emit('port1');
        }, null, this);

        //Creamos controles.
        this.controles = this.input.keyboard.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D,
            SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE
        });

        //Eventos de socket.
        socket.on('jugadorDesconectado', function (idEliminar) {
            if (!nivel1F) {
                self.jugadores.getChildren().forEach(function (jugTemp) {
                    if (idEliminar === jugTemp.id) {
                        jugTemp.destroy();
                    }
                });
            }
        });

        socket.on('movimiento', function (jugTemp) {
            if (!nivel1F) {
                self.jugadores.getChildren().forEach(function (jugMovido) {
                    if (jugTemp.id === jugMovido.id) {
                        jugMovido.setPosition(jugTemp.x1, jugTemp.y1);
                        jugMovido.flipX = jugTemp.flipped;
                        if (jugMovido.flipX) {
                            jugMovido.body.setOffset(12, 8);
                        } else {
                            jugMovido.body.setSize(12, 15).setOffset(2, 8);
                        }
                        jugMovido.play(jugTemp.anim + "E", true);
                    }
                });
            }
        });

        socket.on('eliminarMoneda', function (id) {
            if (!nivel1F) {
                self.monedas.getChildren().forEach(function (moneda) {
                    if (moneda.id === id) {
                        self.monedas.remove(moneda);
                        moneda.destroy();
                    }
                });
            }
        });

        socket.on('eliminarBala', function (id) {
            if (!nivel1F) {
                self.balas.getChildren().forEach(function (bala) {
                    if (bala.id === id) {
                        self.balas.remove(bala);
                        bala.destroy();
                    }
                });
            }
        });
        socket.on('1LF', function () {
            nivel1F = true;
            self.scene.start('p2L');
            self.scene.stop();
        });

        socket.on('reSpawn', function () {
            if (!nivel1F) {
                self.jugador.setPosition(self.x0, self.y0);
            }
        });

        socket.on('disparar', function (info) {
            if (!nivel1F) {
                self.jugadores.getChildren().forEach(function (atacante) {
                    if (info[0] === atacante.id) {
                        var bala = self.getOtraBala();
                        bala.setPosition(atacante.x, atacante.y + 5);
                        bala.setVelocityX(info[1]);
                        self.sfxDisparar.play();
                        atacante.play('dispararE', true);
                    }
                });
            }
        });
    }

    update() {
        var self = this;
        //Actualizamos contadores.
        this.textBalas.setText('Munición: ' + this.contBalas);
        this.textMonedas.setText('Monedas: ' + this.contMonedas);
        //Eliminamos balas que no vayan a chocar.
        this.balaFueraMudo();
        this.otraBalaFueraMudo();
        //Reducimos bounding box en la zona parkour con huecos.
        if (this.jugador.x > 256 && this.jugador.x < 576 && this.jugador.y < 90) {
            if (this.jugador.flipX) {
                this.jugador.body.setSize(3, 15).setOffset(18, 8);
            } else {
                this.jugador.body.setSize(3, 15).setOffset(6, 8);
            }
        } else {
            if (this.jugador.flipX) {
                this.jugador.body.setOffset(12, 8);
            } else {
                this.jugador.body.setSize(12, 15).setOffset(2, 8);
            }
        }
        //Animacion
        if (this.controles.SPACE.isDown && this.contBalas > 0) {
            this.jugador.play('disparar', true);
        } else {
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
        }
        //Movemos al jugador.  
        if (this.controles.W.isDown && this.jugador.body.onFloor()) {
            self.sfxSaltar.play();
            this.jugador.setVelocityY(this.velY);
        }
        if (this.controles.SPACE.isDown) {
            var velBala = 600;
            if (this.jugador.flipX) {
                velBala = velBala * -1;
            }
            if (this.time.now - this.tiempoUltDisparo > this.coolDown && this.contBalas > 0) {
                var bala = this.getBala();
                if (bala !== null) {
                    socket.emit('disparo', [socket.id, velBala]);
                    self.sfxDisparar.play();
                    bala.setPosition(this.jugador.x, this.jugador.y + 5);
                    bala.setVelocityX(velBala);
                }
                this.tiempoUltDisparo = this.time.now;
                this.contBalas--;
            }
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
            socket.emit('movJugador', { x: this.jugador.x, y: this.jugador.y, flipped: this.jugador.flipX, anim: this.jugador.anims.getCurrentKey() });
        }
        this.jugador.dataMovimiento = {
            x: this.jugador.x,
            y: this.jugador.y
        };
    }
}