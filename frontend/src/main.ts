import './style.css'
import typescriptLogo from './typescript.svg'
import viteLogo from '/vite.svg'

import { AUTO, Game, Scale,Types } from 'phaser';
import { Game as MainGame } from './scenes/Game';

const config: Types.Core.GameConfig = {
  type: AUTO,
  width: 1024,
  height: 768,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 300, x: 0},
      debug: false
    }
  },
  scale: {
    mode: Scale.ENVELOP,
    autoCenter: Scale.CENTER_BOTH
  },
  scene: [
    MainGame
  ]
}

export default new Game(config);