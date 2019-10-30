const config = {
    type: Phaser.AUTO,
    audio: {
        disableWebAudio: true
    },
    width: 800,
    height: 600,
    scene: [menu, shop, p1Level, boss1, p2Level, fBoss],
    scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY
    }
};

var game = new Phaser.Game(config);