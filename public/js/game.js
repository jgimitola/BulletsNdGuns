const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 400,
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY
    }
};

var game = new Phaser.Game(config);

function preload() {
    this.load.image('c1', 'assets/textures/character1.png');
}

function create() {
    this.add.image(15, 25, 'c1');
}

function update() {
}
