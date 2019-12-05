# BulletsNdGuns Game

Proyecto de un pequeño juego que utilize hilos y sockets para la asignatura Estructura de Datos. Desarrollado por Jesús Imitola, Santiago Guerrero y Julio Mendoza.

Si desea jugar una versión en vivo haga [click aquí.](https:/bndg.herokuapp.com)

## Descripción:

Se desarrolló un juego multijugador que mezcla el estilo de plataformas y shooter. En este los jugadores deberán recolectar la mayor cantidad de monedas posibles durante cada uno de los 3 niveles que conforman el juego, donde para pasar de uno a otro deberán cruzar los portales que se encuentran en la parte superior de cada nivel. Para ganar cada jugador deberá ir disparandole a sus contrincantes para retrasarlos y así poder recolectar más monedas que sus oponentes. Una vez se entra al último portal el juego termina y se muestra a cada jugador si ganó, perdió o empató.

## Mejoras:

- Optimizar código.

- Mejorar diseño de niveles.

- Añadir mejores efectos de sonido.

- Añadir mejores diseños de personajes y UI.

- En general, añadir más ideas.

## ¿Con qué se desarrolló?

Este proyecto se desarrolló sobre [NodeJS]([https://nodejs.org/](https://nodejs.org) trabajando con las siguientes dependencias:

- [Phaser.io](https://phaser.io/) para la parte del motor del juego.

- [ExpressJS]([https://expressjs.com/](https://expressjs.com) para el servidor web.

- [Socket.io](https://socket.io) para la parte de los sockets.

Para la parte de hilos, se utilizó el propio manejo de Phaser de los hilos.
