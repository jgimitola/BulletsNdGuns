class p2Level extends Phaser.Scene {
    constructor() {
        super("p2L");
        this.velX = 270;
        this.velY = -1000;
        this.contBalas = 2;
        this.contMonedas = 0;
    }
    preload() {
        this.load.tilemapTiledJSON('map2', './assets/tilemaps/p2Level.json');
    }
    create() {
        //Scores de balas y monedas.
        this.textBalas = this.add.text(2, 0, 'Munición: ' + this.contBalas);
        this.textMonedas = this.add.text(2, 16, 'Monedas: ' + this.contMonedas);
        this.cameras.main.setBackgroundColor('rgba(250, 143, 67)');

        //Añadimos al jugador.
        this.jugador = this.physics.add.sprite(64, 540, 'jugador');
        this.anims.create({
            key: "quieto",
            frames: this.anims.generateFrameNumbers('jugador', { start: 7, end: 7 }),
            frameRate: 1,
            repeat: 0
        });
        this.anims.create({
            key: "correr",
            frames: this.anims.generateFrameNumbers('jugador', { start: 0, end: 5 }),
            frameRate: 6,
            repeat: 1
        });
        this.anims.create({
            key: "brincar",
            frames: this.anims.generateFrameNumbers('jugador', { start: 9, end: 9 }),
            frameRate: 1,
            repeat: 0
        });
        this.anims.create({
            key: "caer",
            frames: this.anims.generateFrameNumbers('jugador', { start: 10, end: 10 }),
            frameRate: 1,
            repeat: 0
        });
        this.jugador.setScale(2.3, 2.3);
        this.jugador.body.setSize(12, 15).setOffset(2, 8);
        this.jugador.setCollideWorldBounds(true);

        //Cargamos el mapa.
        const mapa2 = this.make.tilemap({
            key: 'map2'
        });
        const tileset2 = mapa2.addTilesetImage('p1LevelTS', 'tiles');
        const platforms2 = mapa2.createStaticLayer('Plataformas', tileset2, 0, 0)
        platforms2.setCollisionByExclusion(-1, true);
        this.physics.add.collider(this.jugador, platforms2);
        //Creamos balas.
        this.balas = this.physics.add.group({
            allowGravity: false,
            immovable: true
        });
        const balasObjects2 = mapa2.getObjectLayer('Balas')['objects'];
        balasObjects2.forEach(balaObject => {
            const bala = this.balas.create(balaObject.x, balaObject.y - balaObject.height, 'bala').setOrigin(0, 0);
            bala.body.setSize(bala.width - 20, bala.height);
        });
        //Creamos monedas.
        this.monedas = this.physics.add.group({
            allowGravity: false,
            immovable: true
        });
        const monedasObjects2 = mapa2.getObjectLayer('Monedas')['objects'];
        monedasObjects2.forEach(monedaObject => {
            const moneda = this.monedas.create(monedaObject.x, monedaObject.y - monedaObject.height, 'moneda').setOrigin(0, 0);
            moneda.body.setSize(moneda.width - 7, moneda.height - 7);
        });
        //Creamos portal.
        this.portal = this.physics.add.image(32, 60, 'portal');
        this.portal.body.setAllowGravity(false);
        this.portal.body.setSize(this.portal.width - 20, this.portal.height);

        this.physics.add.collider(this.jugador, this.enemigos, this.quitarEnemigos, null, this);
        this.physics.add.overlap(this.jugador, this.monedas, this.aumentarPuntos, null, this);
        this.physics.add.overlap(this.jugador, this.balas, this.aumentarBalas, null, this);
        this.physics.add.overlap(this.jugador, this.portal, () => {
            this.scene.start('p2L');
        }, null, this)

        this.controles = this.input.keyboard.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D
        });
    }

    addEnemigo(x, y, bX) {
        const en = this.enemigos.create(x, y - 16, 'enemigo');
        en.setCollideWorldBounds(true, bX, 0);
    }

    removerBalas() {

    }

    removerMonedas() {

    }

    removerEnemigo() {

    }

    quitarEnemigos() {

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
        if (this.jugador.flipX) {
            this.jugador.body.setOffset(12, 8);
        } else {
            this.jugador.body.setSize(12, 15).setOffset(2, 8);
        }
        //Movemos al jugador.        
        if (this.controles.A.isDown) {
            this.jugador.setVelocityX(this.velX * -1);
            if (this.jugador.body.onFloor()) {
                this.jugador.play('correr', true);
            } else {
                if (this.jugador.body.velocity.y > 0) {
                    this.jugador.play('caer', true);
                } else {
                    this.jugador.play('brincar', true);
                }
            }
            this.jugador.flipX = true;
        } else if (this.controles.D.isDown) {
            this.jugador.setVelocityX(this.velX);
            if (this.jugador.body.onFloor()) {
                this.jugador.play('correr', true);
            } else {
                if (this.jugador.body.velocity.y > 0) {
                    this.jugador.play('caer', true);
                } else {
                    this.jugador.play('brincar', true);
                }
            }
            this.jugador.flipX = false;
        } else {
            this.jugador.setVelocityX(0);
            if (this.jugador.body.onFloor()) {
                this.jugador.play('quieto', true);
            } else {
                if (this.jugador.body.velocity.y > 0) {
                    this.jugador.play('caer', true);
                } else {
                    this.jugador.play('brincar', true);
                }
            }
        }
        if (this.controles.W.isDown && this.jugador.body.onFloor()) {
            this.jugador.setVelocityY(this.velY);
            this.jugador.play('brincar', true);
        }
    }

}