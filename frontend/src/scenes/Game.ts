import { GameObjects, Physics, Scene } from 'phaser';

export class Game extends Scene
{
    player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    platforms!: Phaser.Physics.Arcade.StaticGroup;
    cursors:Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    stars!: Phaser.Physics.Arcade.Group;
    score = 0;
    scoreText!: Phaser.GameObjects.Text;
    bombs!:Physics.Arcade.Group;

    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        this.load.setPath('assets');
        
        this.load.image('background', 'bg.png');
        this.load.image('logo', 'logo.png');

        this.load.image('sky', 'tut/sky.png');
        this.load.image('ground', 'tut/platform.png');
        this.load.image('star', 'tut/star.png');
        this.load.image('bomb', 'tut/bomb.png');
        this.load.spritesheet('dude', 'tut/dude.png', { frameWidth: 32, frameHeight: 48 });
    }

    create ()
    {
        this.cursors = this.input.keyboard?.createCursorKeys();
        this.add.image(400, 300, 'sky');
        //this.add.image(512, 350, 'logo').setDepth(100);
        // this.add.text(512, 490, 'Doing a thing!', {
        //     fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
        //     stroke: '#000000', strokeThickness: 8,
        //     align: 'center'
        // }).setOrigin(0.5).setDepth(100);
        
        this.platforms = this.physics.add.staticGroup();

        this.platforms.create(400,568,'ground').setScale(2).refreshBody();
        this.platforms.create(600, 400, 'ground');
        this.platforms.create(50, 250, 'ground');
        this.platforms.create(750, 220, 'ground');

        this.player = this.physics.add.sprite(100, 450, 'dude');

        this.player.setBounce(0.2);
        this.player.setCollideWorldBounds(true);

        this.anims.create({
            key: 'left',
            frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3}),
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'turn',
            frames: [ { key: 'dude', frame: 4 } ],
            frameRate: 20
        });

        this.anims.create({
            key: 'right',
            frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 } ),
            frameRate: 10,
            repeat: -1
        });

        this.physics.add.collider(this.player, this.platforms);

        this.stars = this.physics.add.group({
            key: 'star',
            repeat: 11,
            setXY: { x: 12, y: 0, stepX: 70 }
        });

        this.stars.children.forEach((child) => {
            if (!(child instanceof Phaser.Physics.Arcade.Sprite)) {
                throw Error("Child is not an instance of Phaser.Physics.Arcade.Sprite");
            }
            
            child.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
            return null;
        });

        this.physics.add.collider(this.stars, this.platforms);
        this.physics.add.overlap(this.player, this.stars, this.collectStar, undefined, this);
        
        this.scoreText = this.add.text(16,16, 'score: 0', { fontSize: '32px', color: '#000'});
        this.bombs = this.physics.add.group();
        this.physics.add.collider(this.bombs, this.platforms);
        this.physics.add.collider(this.player, this.bombs, this.hitbomb, undefined, this);
    }

    collectStar(_player: any, star: any) {
        star.disableBody(true, true);

        this.score+=10;
        this.scoreText.setText('Score: '+this.score);

        if (this.stars.countActive(true) === 0) {
            this.stars.children.forEach((child) => {
                if (!(child instanceof Phaser.Physics.Arcade.Sprite)) {
                    throw Error("Child is not an instance of Phaser.Physics.Arcade.Sprite");
                }
                child.enableBody(true, child.x, 0, true, true);
                return true;
            });

            var x = (this.player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);

            var bomb = this.bombs.create(x, 16, 'bomb');
            bomb.setBounce(1);
            bomb.setCollideWorldBounds(true);
            bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
        }
    }

    hitbomb(player:any, bomb:any) {
        this.physics.pause();
        player.setTint(0xff0000);
        player.anims.play('turn');
        //gameOver = true;
    }

    update(time: number, delta: number): void {
        if (this.cursors?.left.isDown) {
            this.player.setVelocityX(-160);
            this.player.anims.play('left', true);
        } else if ( this.cursors?.right.isDown ) {
            this.player.setVelocityX(160);
            this.player.anims.play('right', true);
        } else {
            this.player.setVelocityX(0);
            this.player.anims.play('turn');
        }

        if (this.cursors?.up.isDown && this.player.body.touching.down) { 
            this.player.setVelocityY(-330);
        }
    }
}
