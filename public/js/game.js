const config = {
    title: 'BulletsNdGuns',
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY
    },
    audio: {
        disableWebAudio: true
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: {
                y: 1500
            },
            debug: true
        }
    },
    scene: [loader, menu, p1Level, p2Level, fBoss],
    pixelArt: true,
    antialias: true
};

var game = new Phaser.Game(config);