class loader extends Phaser.Scene {

    constructor() {
        super("load");
    }

    preload() {
        //Obtenido de: https://gamedevacademy.org/creating-a-preloading-screen-in-phaser-3/?a=13
        var progressBar = this.add.graphics();
        var progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(240, 270, 320, 50);

        var width = this.cameras.main.width;
        var height = this.cameras.main.height;
        var loadingText = this.make.text({
            x: width / 2,
            y: height / 2 - 50,
            text: 'Cargando...',
            style: {
                font: '20px monospace',
                fill: '#ffffff'
            }
        });
        loadingText.setOrigin(0.5, 0.5);

        var percentText = this.make.text({
            x: width / 2,
            y: height / 2 - 5,
            text: '0%',
            style: {
                font: '18px monospace',
                fill: '#ffffff'
            }
        });
        percentText.setOrigin(0.5, 0.5);

        var assetText = this.make.text({
            x: width / 2,
            y: height / 2 + 50,
            text: '',
            style: {
                font: '18px monospace',
                fill: '#ffffff'
            }
        });

        assetText.setOrigin(0.5, 0.5);

        this.load.on('progress', function (value) {
            percentText.setText(parseInt(value * 100) + '%');
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(250, 280, 300 * value, 30);
        });

        this.load.on('fileprogress', function (file) {
            assetText.setText('Loading asset: ' + file.key);
        });

        this.load.on('complete', function () {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
            percentText.destroy();
            assetText.destroy();
        });

        //Cargamos todo.
        this.load.audio('hoverB', '../assets/sounds/hoverButton.ogg');
        this.load.audio('disparo', '../assets/sounds/disparo.mp3');
        this.load.audio('saltar', '../assets/sounds/saltar.wav');
        this.load.image('titulo', '../assets/textures/titulo.png');
        this.load.image('creditos', '../assets/textures/creditos.png');
        this.load.image('info', '../assets/textures/info.png');
        this.load.image('popUp', '../assets/textures/popUpComoJugar.png');
        this.load.image('fondo', '../assets/textures/fondo.png');
        this.load.image('jugarBoton', '../assets/textures/jugarBoton.png');
        this.load.image('jugarBotonHover', '../assets/textures/jugarBoton_Hover.png');
        this.load.image('comoJBoton', '../assets/textures/comojugarBoton.png');
        this.load.image('comoJBotonHover', '../assets/textures/comojugarBoton_Hover.png');
        this.load.spritesheet('waitingFL', '../assets/textures/waitingforlove.png', {
            frameWidth: 291,
            frameHeight: 70
        });
        this.load.spritesheet('jugador', './assets/textures/jugadorSpriteSheet.png', {
            frameWidth: 27,
            frameHeight: 23
        });
        this.load.spritesheet('enemigo', './assets/textures/jugadorEnemigoSpriteSheet.png', {
            frameWidth: 27,
            frameHeight: 23
        });
        this.load.image('bala', './assets/textures/bala.png');
        this.load.image('balaD', './assets/textures/balaDisparada.png');
        this.load.image('moneda', './assets/textures/moneda.png');
        this.load.image('portal', './assets/textures/portal.png');
        this.load.image('tiles', './assets/textures/p1LevelTS.png');
        this.load.tilemapTiledJSON('map', './assets/tilemaps/p1Level.json');
        this.load.tilemapTiledJSON('map2', './assets/tilemaps/p2Level.json');
        this.load.tilemapTiledJSON('map3', './assets/tilemaps/bossLevel.json');
    }
    create() {        
        this.anims.create({
            key: 'esperando',
            frames: this.anims.generateFrameNumbers('waitingFL'),
            frameRate: 2,
            repeat: -1
        });
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
        this.anims.create({
            key: "disparar",
            frames: this.anims.generateFrameNumbers('jugador', { start: 8, end: 8 }),
            frameRate: 1,
            repeat: 1
        });
        this.anims.create({
            key: "quietoE",
            frames: this.anims.generateFrameNumbers('enemigo', { start: 7, end: 7 }),
            frameRate: 1,
            repeat: 0
        });
        this.anims.create({
            key: "correrE",
            frames: this.anims.generateFrameNumbers('enemigo', { start: 0, end: 5 }),
            frameRate: 6,
            repeat: 1
        });
        this.anims.create({
            key: "brincarE",
            frames: this.anims.generateFrameNumbers('enemigo', { start: 9, end: 9 }),
            frameRate: 1,
            repeat: 0
        });
        this.anims.create({
            key: "caerE",
            frames: this.anims.generateFrameNumbers('enemigo', { start: 10, end: 10 }),
            frameRate: 1,
            repeat: 0
        });
        this.anims.create({
            key: "dispararE",
            frames: this.anims.generateFrameNumbers('enemigo', { start: 8, end: 8 }),
            frameRate: 1,
            repeat: 1
        });
        this.scene.start('menu');
    }

}