class menu extends Phaser.Scene {
    constructor() {
        super("menu");
    }
    preload() {
        this.load.audio('hoverB', '../assets/sounds/hoverButton.ogg');
        this.load.image('titulo', '../assets/textures/titulo.png');
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
        jugarB.setInteractive();
        jugarB.on('pointerover', () => {
            jugarB = this.add.image(400, 272, 'jugarBotonHover');
            botonEfecto.play();
        });
        jugarB.on('pointerout', () => {
            jugarB = this.add.image(400, 272, 'jugarBoton');
        });
        jugarB.on('pointerdown', () => { }); //Iniciar escena de juego.
        //Botón ¿Cómo jugar? y sus eventos.
        let cjugarB = this.add.image(400, 357, 'comoJBoton');
        let popUpJ = this.add.image(-100, -100, '');
        popUpJ.setInteractive();
        cjugarB.setInteractive();
        cjugarB.on('pointerover', () => {
            cjugarB = this.add.image(400, 357, 'comoJBotonHover');
            botonEfecto.play();
        });
        cjugarB.on('pointerout', () => { cjugarB = this.add.image(400, 357, 'comoJBoton') });
        cjugarB.on('pointerdown', () => { popUpJ.setPosition(100, 100) });

        //Destruir Pop-Up.
        popUpJ.on('pointerdown', () => { popUpJ.destroy() });

    }

}