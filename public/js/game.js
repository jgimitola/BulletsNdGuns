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
                y: 300
            },
            debug: true
        }
    },
    scene: [menu, p1Level, p2Level, fBoss]
};

var game = new Phaser.Game(config);