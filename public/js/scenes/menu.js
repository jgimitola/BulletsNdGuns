class menu extends Phaser.Scene {

    constructor() {
        super("menu");
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
        let esperandoB = this.add.sprite(-150, 272, 'waitingFL');
        let click = false;
        jugarB.setInteractive();
        jugarBH.setInteractive();
        jugarB.on('pointerover', () => {
            jugarBH.setPosition(400, 272);
            jugarB.setPosition(-150, 272);
            botonEfecto.play();
        });
        jugarBH.on('pointerout', () => {
            if (!click) {
                jugarBH.setPosition(-150, 272);
                jugarB.setPosition(400, 272);
            }
        });
        jugarBH.on('pointerdown', () => {
            click = true;
            jugarB.setPosition(-150, 272);
            jugarBH.setPosition(-150, 272);
            esperandoB.setPosition(400, 272);
            esperandoB.play('esperando');
            socket.emit('jugadorListo');
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
        //Iniciamos cuando el servidor sepa que todos están listos.
        socket.on('iniciar', (init) => {
            if (init) {
                this.scene.start('p1L');
            }
        });
    }
}