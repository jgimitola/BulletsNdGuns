class p1Level extends Phaser.Scene {

    constructor() {
        super("p1L");
        //Velocidades jugador.
        this.velX = 270;
        this.velY = -1000;
    }

    create() {
        //Contadores.
        this.contBalas = 2;
        this.contMonedas = 0;
        //Scores de balas y monedas.
        this.textBalas = this.add.text(2, 0, 'Munición: ' + this.contBalas);
        this.textMonedas = this.add.text(2, 12, 'Monedas: ' + this.contMonedas);
        //Fondo.
        this.cameras.main.setBackgroundColor('rgba(250, 143, 67)');
        //Añadimos al jugador.
        this.jugador = this.physics.add.sprite(16, 515, 'jugador');
        this.jugador.setScale(2.3, 2.3);
        this.jugador.body.setSize(12, 15).setOffset(2, 8);
        this.jugador.setCollideWorldBounds(true);
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
        this.balasObjects = this.mapa.getObjectLayer('Balas')['objects'];
        this.balasObjects.forEach(balaObject => {
            const bala = this.balas.create(balaObject.x, balaObject.y - balaObject.height, 'bala').setOrigin(0, 0);
            bala.body.setSize(bala.width - 20, bala.height);
        });
        //Creamos monedas.
        this.monedas = this.physics.add.group({
            allowGravity: false,
            immovable: true
        });
        this.monedasObjects = this.mapa.getObjectLayer('Monedas')['objects'];
        this.monedasObjects.forEach(monedaObject => {
            const moneda = this.monedas.create(monedaObject.x, monedaObject.y - monedaObject.height, 'moneda').setOrigin(0, 0);
            moneda.body.setSize(moneda.width - 7, moneda.height - 7);
        });
        //Creamos portal.
        this.portal = this.physics.add.image(704, 60, 'portal');
        this.portal.body.setAllowGravity(false);
        this.portal.body.setSize(this.portal.width - 20, this.portal.height);

        //Colision jugador con monedas o balas (Coleccionables).
        this.physics.add.overlap(this.jugador, this.monedas, this.aumentarPuntos, null, this);
        this.physics.add.overlap(this.jugador, this.balas, this.aumentarBalas, null, this);
        this.physics.add.overlap(this.jugador, this.portal, () => {
            this.scene.start('p2L');
        }, null, this)

        //Creamos controles.
        this.controles = this.input.keyboard.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D
        });
    }

    aumentarPuntos(jugador, moneda) {
        this.monedas.remove(moneda);
        moneda.destroy();
        this.contMonedas += 1;
        //        socket.emit('monedaRecolectada', moneda);
        //Enviar a todos los clientes.
    }
    aumentarBalas(jugador, bala) {
        this.balas.remove(bala);
        bala.destroy();
        this.contBalas += 1;
        //Enviar a todos los clientes.
    }

    update() {
        //Actualizamos contadores.
        this.textBalas.setText('Munición: ' + this.contBalas);
        this.textMonedas.setText('Monedas: ' + this.contMonedas);
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
    }
}