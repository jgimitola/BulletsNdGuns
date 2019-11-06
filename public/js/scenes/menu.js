class menu extends Phaser.Scene {
    constructor() {
        super("menu");
    }
    preload() {
        this.load.audio('hoverB', '../assets/sounds/hoverButton.ogg');
        this.load.image('titulo', '../assets/textures/titulo.png');
        this.load.image('popUp', '../assets/textures/popUpComoJugar.png');
        this.load.image('fondo', '../assets/textures/fondo.png');
        this.load.image('jugarBoton', '../assets/textures/jugarBoton.png');
        this.load.image('jugarBotonHover', '../assets/textures/jugarBoton_Hover.png');
        this.load.image('comoJBoton', '../assets/textures/comojugarBoton.png');
        this.load.image('comoJBotonHover', '../assets/textures/comojugarBoton_Hover.png');
    }

    create() {
        //Sonido ratón sobre botón.
        let botonEfecto = this.sound.add('hoverB', {
            volume: 0.2,
            loop: false
        });
        //Imagen del fondo.
        this.add.image(400, 300, 'fondo');
        //Imagen de titulo.
        this.add.image(400, 192, 'titulo');
        //Botón comenzar y sus eventos.
        let jugarB = this.add.image(400, 272, 'jugarBoton');
        let jugarBH = this.add.image(-150, 272, 'jugarBotonHover');
        jugarB.setInteractive();
        jugarBH.setInteractive();
        jugarB.on('pointerover', () => {
            jugarBH.setPosition(400, 272);
            jugarB.setPosition(-150, 272);
            botonEfecto.play();
        });
        jugarBH.on('pointerout', () => {
            jugarBH.setPosition(-150, 272);
            jugarB.setPosition(400, 272);
        });
        jugarBH.on('pointerdown', () => {
            this.scene.start('p1L');
        });
        //Botón ¿Cómo jugar? y sus eventos.
        let cjugarB = this.add.image(400, 357, 'comoJBoton');
        let cjugarBH = this.add.image(-150, 357, 'comoJBotonHover');
        let popUpJ = this.add.image(-272, -137, 'popUp');
        popUpJ.setInteractive();
        cjugarB.setInteractive();
        cjugarBH.setInteractive();
        cjugarB.on('pointerover', () => {
            cjugarBH.setPosition(400, 357);
            cjugarB.setPosition(-150, 357);
            botonEfecto.play();
        });
        cjugarBH.on('pointerout', () => {
            cjugarB.setPosition(400, 357);
            cjugarBH.setPosition(-150, 357);
        });
        cjugarBH.on('pointerdown', () => {
            popUpJ.setPosition(400, 280);
        });
        popUpJ.on('pointerdown', () => {
            popUpJ.setPosition(-272, -137);
        });
    }
}