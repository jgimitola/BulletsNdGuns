class p1Level extends Phaser.Scene {

    constructor() {
        super("p1L");
    }

    preload() {
        this.load.image('jugador', './assets/textures/character1.png');
        this.load.image('bala', './assets/textures/bala.png');
        this.load.image('moneda', './assets/textures/moneda.png');
        this.load.image('portal', './assets/textures/portal.png');
        this.load.image('tiles', './assets/textures/p1LevelTS.png');
        this.load.tilemapTiledJSON('map', './assets/tilemaps/p1Level.json');
    }

    create() {
        //Fondo.
        this.cameras.main.setBackgroundColor('rgba(250, 143, 67)');
        //Añadimos al jugador.
        this.jugador = this.physics.add.image(16, 515, 'jugador');
        this.jugador.setCollideWorldBounds(true);
        //Cargamos el mapa.
        const mapa = this.make.tilemap({
            key: 'map'
        });
        const tileset = mapa.addTilesetImage('p1LevelTS', 'tiles');
        const platforms = mapa.createStaticLayer('Plataformas', tileset, 0, 0)
        platforms.setCollisionByExclusion(-1, true);
        this.physics.add.collider(this.jugador, platforms);
        //Creamos balas.
        this.balas = this.physics.add.group({
            allowGravity: false,
            immovable: true
        });
        const balasObjects = mapa.getObjectLayer('Balas')['objects'];
        balasObjects.forEach(balaObject => {
            const bala = this.balas.create(balaObject.x, balaObject.y - balaObject.height, 'bala').setOrigin(0, 0);
            bala.body.setSize(bala.width - 20, bala.height);
        });
        //Creamos monedas.
        this.monedas = this.physics.add.group({
            allowGravity: false,
            immovable: true
        });
        const monedasObjects = mapa.getObjectLayer('Monedas')['objects'];
        monedasObjects.forEach(monedaObject => {
            const moneda = this.monedas.create(monedaObject.x, monedaObject.y - monedaObject.height, 'moneda').setOrigin(0, 0);
            moneda.body.setSize(moneda.width - 7, moneda.height - 7);
        });
        //Creamos portal.
        this.portal = this.physics.add.image(704, 60, 'portal');
        this.portal.body.setAllowGravity(false);
        this.portal.body.setSize(this.portal.width - 20, this.portal.height);
        //Colision jugador con monedas o balas (Coleccionables).
        this.physics.add.collider(this.jugador, this.monedas, aumentarPuntos, null, this);
        this.physics.add.collider(this.jugador, this.balas, aumentarMunicion, null, this);

        //Creamos controles.
        this.controles = this.input.keyboard.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            D: Phaser.Input.Keyboard.KeyCodes.D
        });
    }

    update() {
        //Reducimos bounding box en la zona parkour con huecos.
        if (this.jugador.x > 256 && this.jugador.x < 576 && this.jugador.y < 90) {
            this.jugador.body.setSize(this.jugador.width - 20, this.jugador.height);
        } else {
            this.jugador.body.setSize(30, this.jugador.height);
        }
        //Movemos al jugador.
        if (this.controles.A.isDown) {
            this.jugador.setVelocityX(-200);
        } else if (this.controles.D.isDown) {
            this.jugador.setVelocityX(200);
        } else {
            this.jugador.setVelocityX(0);
        }
        if (this.controles.W.isDown && this.jugador.body.onFloor()) {
            this.jugador.setVelocityY(-235);
        }
    }
}