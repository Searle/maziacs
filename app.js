(function() {

"use strict";

var DEBUG= true;

var even= function( f ) {
    return f & ~1;
}

var mouseX;
var mouseY;

var canvas;
var c;
var cWidth;
var cHeight;

var maze= [];
var mazeWidth= 9;
var mazeHeight= 9;
var pxTileSize= 48;

// Breite in Tiles des gequetschten Aussenbereiches
var borderX= 2;
var borderY= 2;

var PLAYER= -7;
var SPIDER= -6;
var DOOR= -5;
var KEY= -4;
var CALC= -3;
var FRAME= -2;
var WALL= -1;
var FLOOR= 0;

var dirs= [ [ 0, -1 ], [ 1, 0 ], [ 0, 1 ], [ -1, 0 ] ];

var items;

var pxMazeWidth;
var pxMazeHeight;

var Player= function() {
    this.type= PLAYER;
    this.pxWidth= even(pxTileSize * .6);
    this.pxHeight= even(pxTileSize * .8);
    this.pxImageWidth= 60;
    this.pxImageHeight= 60;

    this.items= [];    // Items the player holds

    this.pxX= undefined;
    this.pxY= undefined;
    this.mazeX= undefined;
    this.mazeY= undefined;
    this.toKey= undefined;    // Maze x/y heading(!!) position. may not be actual position
    this.isMoving= undefined;
    this.movementX= undefined;
    this.movementY= undefined;
    this.projX= undefined;
    this.projY= undefined;
}

var player= new Player();

var monsters;

var random= function( from, until ) {
    return Math.floor(Math.random() * (until - from) + from);
};

var randomf= function( from, until ) {
    return Math.random() * (until - from) + from;
};


// =============================================================================
//  Calculate distances from point in maze
// =============================================================================

var calcDistances= function( startPosX, startPosY ) {

    var distance= 0;
    var key= startPosX + ':' + startPosY;
    var queue= [ [ key, startPosX, startPosY, distance ] ];
    var maxDistanceKey= key;
    var maxDistance= distance;

    var lookup= {};
    lookup[key]= [ startPosX, startPosY, distance, undefined ];

    var byDistance= [ [ key ] ];
    var deadEnds= [];

    while ( queue.length > 0 ) {
        var pos= queue.pop();
        var key= pos[0];
        var posX= pos[1];
        var posY= pos[2];
        var distance= pos[3] + 1;

        var isDeadEnd= true;
        for ( var dir= 0; dir < 4; dir++ ) {
            var nextPosX= posX + dirs[dir][0];
            var nextPosY= posY + dirs[dir][1];
            if ( maze[nextPosY][nextPosX] < FLOOR ) continue;

            var nextKey= nextPosX + ':' + nextPosY;
            if ( nextKey in lookup ) continue;

            lookup[nextKey]= [ nextPosX, nextPosY, distance, key ];

            // Children merken, falls benoetigt
            // lookup[key].push(nextKey);

            if ( byDistance.length - 1 < distance ) {
                byDistance[distance]= [ nextKey ];
            }
            else {
                byDistance[distance].push(nextKey);
            }

            queue.push([ nextKey, nextPosX, nextPosY, distance ]);
            isDeadEnd= false;

            if ( distance > maxDistance ) {
                maxDistanceKey= nextKey;
                maxDistance= distance;
            }
        }
        if ( isDeadEnd ) {
            deadEnds.push(key);
        }
    }

    return {
        lookup: lookup,
        maxDistanceKey: maxDistanceKey,
        maxDistance: maxDistance,
        byDistance: byDistance,
        deadEnds: deadEnds,
    };
};

var updateMazeFloor= function( dists ) {

    // Set maze floor data
    for ( var key in dists.lookup ) {
        var pos= dists.lookup[key];
        maze[pos[1]][pos[0]]= FLOOR + pos[2];
    }
}


// =============================================================================
//  Generate new maze
// =============================================================================

// Generate Doors & Keys
var genItems= function( dists ) {
    items= {};

    var lookup= dists.lookup;
    var maxDistance= dists.maxDistance;
    var maxDistanceKey= dists.maxDistanceKey;
    var deadEnds= dists.deadEnds;

    var solution= [];
    var solutionLookup= {};

    var key= maxDistanceKey;
    while ( key ) {
        solutionLookup[key]= maxDistance - solution.length;
        solution.unshift([ key ]);
        key= lookup[key][3];
    }

    for ( var i= 0; i < deadEnds.length; i++ ) {
        var key= deadEnds[i];
        if ( key === maxDistanceKey ) continue;

        var prevKey= undefined;
        while ( key ) {
            if ( key in solutionLookup ) {
                solution[solutionLookup[key]].push([ deadEnds[i], prevKey ]);
                break;
            }
            prevKey= key;
            key= lookup[key][3];
        }
    }

    var end= solution.length / 10;

    var DOOR_MAX_POS= end;
    var DOOR_MIN_POS= end * 2;
    var KEY_MIN_POS= end;

    // FIXME: Find sane formula
    var doorsMake= Math.floor(Math.pow(mazeWidth * mazeHeight, .45) * .5);

// doorsMake= 100;

    var _makeDoorKey= function( doorKey, ix ) {
        var keyKey;
        var entryKeyKey;
        var ix1= random(KEY_MIN_POS, ix);
        while ( ix1 < ix ) {
            if ( solution[ix1].length > 1 ) {
                var deadEndInfo= solution[ix1][random(1, solution[ix1].length)];
                if ( !(deadEndInfo[0] in items) ) {
                    keyKey= deadEndInfo[0];
                    entryKeyKey= deadEndInfo[1];
                    break;
                }
            }
            ix1++;
        }
        if ( keyKey !== undefined ) {
            doorsMake--;
            items[doorKey]= { type: DOOR, color: doorsMake, opening: 0, lightning: 0 };
            items[keyKey]= { type: KEY, color: doorsMake };

            // 50% chance to place a key at start of junction to block current
            if ( doorsMake > 0 && entryKeyKey && Math.random() > .5 ) {
                _makeDoorKey(entryKeyKey, ix1);
            }
        }
    };

    for ( var i= doorsMake * 3; i > 0 && doorsMake > 0; i-- ) {
        var doorKey= undefined;
        var ix= random(DOOR_MIN_POS, solution.length - DOOR_MAX_POS);
        while ( ix >= DOOR_MIN_POS ) {
            if ( solution[ix].length == 1 && !(solution[ix] in items) ) {

                // Don't allow a door in a bend, where the player can sneak past it.
                var mazeX= lookup[solution[ix][0]][0];
                var mazeY= lookup[solution[ix][0]][1];
                if (   (maze[mazeY][mazeX - 1] < FLOOR || maze[mazeY - 1][mazeX] < FLOOR)
                    && (maze[mazeY][mazeX + 1] < FLOOR || maze[mazeY - 1][mazeX] < FLOOR)
                    && (maze[mazeY][mazeX - 1] < FLOOR || maze[mazeY + 1][mazeX] < FLOOR)
                    && (maze[mazeY][mazeX + 1] < FLOOR || maze[mazeY + 1][mazeX] < FLOOR)
                ) {
                    doorKey= solution[ix][0];
                    break;
                }
            }
            ix--;
        }
        if ( doorKey !== undefined ) {
            _makeDoorKey(doorKey, ix);
        }
    }

    // console.table(lookup);
    // console.table(solution);
    // console.log(solutionLookup);
    // console.table(items);
    // console.log(deadEnds);
    // console.table(solution);
};

var genMonsters= function() {

    monsters= [];

    var monster= {
        type: SPIDER,
        x: player.pxX,
        y: player.pxY,
        projX: 0,
        projY: 0,
        atTarget: 0,
        steps: [],
    };

    monsters.push(monster);
};

var genMaze= function() {

    pxMazeWidth= pxTileSize * mazeWidth;
    pxMazeHeight= pxTileSize * mazeHeight;

    for ( var y= 0; y <= mazeHeight + 1; y++ ) {
        maze[y]= [];
    }

    for ( var y= 1; y <= mazeHeight; y += 2 ) {
        for ( var x= 1; x <= mazeWidth; x += 2 ) {
            maze[y][x]= CALC;
            maze[y][x + 1]= WALL;
            maze[y + 1][x]= WALL;
            maze[y + 1][x + 1]= WALL;
        }
    }

    for ( var y= 0; y <= mazeHeight + 1; y++ ) {
        maze[y][0]= FRAME;
        maze[y][mazeWidth + 1]= FRAME;
    }

    for ( var x= 1; x <= mazeWidth; x++ ) {
        maze[0][x]= FRAME;
        maze[mazeHeight + 1][x]= FRAME;
    }

    // Slow, horrible and naive. Ok for now...

    var floor= FLOOR;

    while ( true ) {

        var sample= [];
        for ( var y= 1; y <= mazeHeight; y += 2 ) {
            for ( var x= 1; x <= mazeWidth; x += 2 ) {
                if ( maze[y][x] === CALC ) sample.push([ x, y ]);
            }
        }
        if ( sample.length === 0 ) break;

        var retry= true;
        while ( retry ) {
            retry= false;

            var pos= sample[random(0, sample.length)];
            var posX= pos[0];
            var posY= pos[1];

            while ( maze[posY][posX] === CALC ) {
                maze[posY][posX]= floor;

                var dir= random(0, 4);

                // IDEE: bei i == 3 bzw == 2 werden wirds wiggliger
                var i_max= floor === FLOOR ? 4 : 2;
                for ( var i= 0; i < i_max; i++ ) {
                    var wallPosX= posX + dirs[dir][0];
                    var wallPosY= posY + dirs[dir][1];
                    if ( maze[wallPosY][wallPosX] === WALL ) {
                        var floorPosX= posX + dirs[dir][0] * 2;
                        var floorPosY= posY + dirs[dir][1] * 2;
                        if ( maze[floorPosY][floorPosX] !== floor ) {
                            maze[wallPosY][wallPosX]= floor;
                            posX += dirs[dir][0] * 2;
                            posY += dirs[dir][1] * 2;
                            break;
                        }
                    }
                    dir= (dir + 1) & 3;
                }
                if ( i >= i_max && floor > FLOOR ) {
                    for ( var y= 1; y <= mazeHeight; y += 2 ) {
                        for ( var x= 1; x <= mazeWidth; x += 2 ) {
                            if ( maze[y][x] === floor ) maze[y][x]= CALC;
                            if ( maze[y][x + 1] === floor ) maze[y][x + 1]= WALL;
                            if ( maze[y + 1][x] === floor ) maze[y + 1][x]= WALL;
                        }
                    }
                    retry= true;
                    break;
                }
            }
        }

        floor++;
    }


    // Find most distant cell
    var dists= calcDistances(1,1);
    var startPos= dists.lookup[dists.maxDistanceKey];

    // Take the most distant cell and recalculate distances
    dists= calcDistances(startPos[0], startPos[1]);

// console.log(startPos);
// console.table(dists.byDistance);

    updateMazeFloor(dists);

    player.pxX= (startPos[0] - .5) * pxTileSize;
    player.pxY= (startPos[1] - .5) * pxTileSize;

    genItems(dists);
    genMonsters();

    // console.table(maze);
};


// =============================================================================
//  Projection
// =============================================================================

// Static, to reduce GCs
var projX= [];
var projY= [];

var calcTileProj= function( pos, proj, p ) {

    var PI_2= Math.PI / 2;

    var pxTargetSize= p.pxTargetSize;
    var border= p.border;
    var mazeSize= p.mazeSize;

    var pxBorder= border * pxTileSize;
    var pxMazeSize= pxTileSize * mazeSize;
    var pxMazeMove= pxTargetSize - pxMazeSize;
    if ( pxMazeMove > 0 ) pxMazeMove= 0;

    var pxTile0= pxMazeMove * pos / pxMazeSize;
    if ( pxMazeSize < pxTargetSize ) {
        pxTile0 += (pxTargetSize - pxMazeSize) / 2;
        pxTargetSize= pxTile0 + pxMazeSize;
    }

    var pxTileN= pxTile0 + pxMazeSize;

    var borderTile0= -1;
    var borderTile1= mazeSize;

    var pxTile= pxTile0;

    // <= !! Ein zusaetzlicher Wert wird noch benoetigt
    for ( var tile= 0; tile <= mazeSize; tile++ ) {

        if ( pxTile < pxBorder ) {
            borderTile0= tile;

            var fTile= (pxTile - pxTile0) / (pxBorder - pxTile0);
            proj[tile]= (1 - Math.sin(PI_2 + PI_2 * fTile)) * pxBorder;
        }
        else if ( pxTile >= pxTargetSize - pxBorder ) {
            if ( borderTile1 == mazeSize ) borderTile1= tile;

            var fTile= (pxTile - pxTileN) / (pxTargetSize - pxBorder - pxTileN);
            proj[tile]= pxTargetSize - (1 - Math.sin(PI_2 + PI_2 * fTile)) * pxBorder;
        }
        else {
            proj[tile]= pxTile;
        }

        pxTile += pxTileSize;
    }

    // Zu breite Tiles abschmaelern (Passiert durch Sinus)
    for ( ; borderTile0 >= 0; borderTile0-- ) {
        if ( proj[borderTile0 + 1] - proj[borderTile0] > pxTileSize ) {
            proj[borderTile0]= proj[borderTile0 + 1] - pxTileSize;
        }
    }

    for ( ; borderTile1 < mazeSize; borderTile1++ ) {
        if ( proj[borderTile1] - proj[borderTile1 - 1] > pxTileSize ) {
            proj[borderTile1]= proj[borderTile1 - 1] + pxTileSize;
        }
    }
};

var proj= function( x, y ) {
    var mazeX= Math.floor(x / pxTileSize);
    var mazeY= Math.floor(y / pxTileSize);
    var fracX= (x % pxTileSize) / pxTileSize;
    var fracY= (y % pxTileSize) / pxTileSize;
    return [ projX[mazeX] + (projX[mazeX + 1] - projX[mazeX]) * fracX
           , projY[mazeY] + (projY[mazeY + 1] - projY[mazeY]) * fracY ];
};

// TODO: Optimieren falls oefter benoetigt
var invProj= function( x, y ) {
    for ( var xi= projX.length - 2; xi >= 0; xi-- ) {
        if ( x >= projX[xi] ) {
            for ( var yi= projY.length - 2; yi >= 0; yi-- ) {
                if ( y >= projY[yi] ) {
                    return [ (xi + (x - projX[xi]) / (projX[xi + 1] - projX[xi])) * pxTileSize
                           , (yi + (y - projY[yi]) / (projY[yi + 1] - projY[yi])) * pxTileSize ];
                }
            }
            return;
        }
    }
};

var calcProjs= function() {

    calcTileProj(player.pxX, projX, {
        pxTargetSize: cWidth,
        border: borderX,
        mazeSize: mazeWidth,
    });

    calcTileProj(player.pxY, projY, {
        pxTargetSize: cHeight,
        border: borderY,
        mazeSize: mazeHeight,
    });

    var playerProj= proj(player.pxX, player.pxY);
    player.projX= playerProj[0];
    player.projY= playerProj[1];

    for ( var i= 0; i < monsters.length; i++ ) {
        var monsterProj= proj(monsters[i].x, monsters[i].y);
        monsters[i].projX= monsterProj[0];
        monsters[i].projY= monsterProj[1];
    }
};


// =============================================================================
//  Sprites
// =============================================================================

var TILES= 0;
var TILE_SHADOWS= 1;
var PLAYER= 2;
var SPRITE_IMAGE_COUNT= 3;

var imageFiles= [
    'sprites.png', 'shadows.png', 'player.png'
];
var imageSizes= [
    128, 128, 64
];

var images= [];

var spriteCanvas= document.createElement('canvas');
var spriteContext= spriteCanvas.getContext('2d');

var cachedRgbs= [];

var getRgb= function( color ) {
    if ( !(color in cachedRgbs) ) {
        spriteContext.fillStyle= 'hsl(' + (color * 50) + ',100%,60%)';
        spriteContext.fillRect(0, 0, 1, 1);
        var rgba= spriteContext.getImageData(0, 0, 1, 1).data;
        cachedRgbs[color]= [ rgba[0], rgba[1], rgba[2] ];
    }
    return cachedRgbs[color];
}

var loadImage= function( url, cb ) {
    var image= new Image();
    image.src= url;
    image.onload= function() {
        image.onload= undefined;
        cb(image);
    };
}

var loadSprites= function( cb ) {
    if ( images.length < SPRITE_IMAGE_COUNT ) {
        loadImage(imageFiles[images.length], function( image ) {
            images.push(image);
            loadSprites(cb);
        });
        return;
    }
    cb();
}

var cachedImages= [];

var _getImage= function( imageIndex, x, y, width, height, color, withShadow ) {

    var image= images[imageIndex];

    if ( width === undefined ) width= pxTileSize;
    if ( height === undefined ) height= pxTileSize;

    var key= x + ':' + y + ':' + width + ':' + height + ':' + color;
    if ( !(key in cachedImages) ) {

        x *= imageSizes[imageIndex];
        y *= imageSizes[imageIndex];

        spriteCanvas.width= width;
        spriteCanvas.height= width;
        spriteContext.drawImage(image, x, y, imageSizes[imageIndex], imageSizes[imageIndex], 0, 0, width, height);

        if ( color !== undefined ) {
            var imageData= spriteContext.getImageData(0, 0, width, height);
            var rgb= getRgb(color);
            var rgba= imageData.data;
            for ( var i= width * height * 4 - 4; i >= 0; i -= 4 ) {
                if ( rgba[i] === 0 && rgba[i + 3] !== 0 ) {
                    rgba[i]= rgb[0];
                    rgba[i + 1]= rgb[1];
                    rgba[i + 2]= rgb[2];
                }
            }
            spriteContext.putImageData(imageData, 0, 0);
        }

        if ( withShadow ) {
            spriteContext.drawImage(images[imageIndex + 1], x, y, imageSizes[imageIndex], imageSizes[imageIndex], 0, 0, width, height);
        }

        var image= new Image();
        image.src = spriteCanvas.toDataURL("image/png");
        cachedImages[key]= image;
    }

    return cachedImages[key];
}

var getImage= function( imageIndex, x, y, width, height ) {
    return _getImage(imageIndex, x, y, width, height, undefined, false);
}

var getItemImage= function( item, width, height ) {
    if ( item.type === KEY ) {
        return _getImage(TILES, 0, 0, width, height, item.color, true);
    }
    if ( item.type === DOOR ) {
        if ( item.opening < 0 ) return;

        return _getImage(TILES, Math.floor(item.opening), 1, width, height, item.color, true);
    }
};


// =============================================================================
//  Draw Canvas
// =============================================================================

var drawRect= function( x, y, w, h, hue ) {
    c.fillStyle= 'hsl(' + hue + ',100%,60%)';
    c.fillRect(x - w / 2, y - h / 2, w, h);
};

var drawMaze= function() {
    var c_= c; // Localize

    for ( var mazeY= 0; mazeY < mazeHeight; mazeY++ ) {
        for ( var mazeX= 0; mazeX < mazeWidth; mazeX++ ) {

            var px0= projX[mazeX];
            var px1= projX[mazeX + 1]
            var py0= projY[mazeY];
            var py1= projY[mazeY + 1]

            var content= maze[mazeY + 1][mazeX + 1];

            if ( content == WALL ) {
                // c_.fillStyle = 'rgb(' + Math.floor(255 * mazeX / mazeWidth) + ',' + (((mazeX + mazeY) & 1) ? 100 : 0) + ',0)';
                c_.fillStyle = 'rgb(20,100,0)';
            }
            else if ( content >= FLOOR ) {
                c_.fillStyle = 'hsl(10,50%,' + (80 - content * 1 + FLOOR) +'%)';
            }
            else {
                c_.fillStyle = 'rgb(0,0,0)';
            }
            c_.fillRect(px0, py0, px1 - px0, py1 - py0);

            var key= (mazeX + 1) + ':' + (mazeY + 1);
            if ( key in items ) {

                if ( items[key].type == KEY || items[key].type == DOOR ) {
                    var itemImage= getItemImage(items[key]);
                    if ( itemImage ) {
                        c.drawImage(itemImage, 0, 0, pxTileSize, pxTileSize, px0, py0, px1 - px0, py1 - py0);
                    }
                    if ( key == player.toKey && items[key].type == DOOR && items[key].opening == 0 ) {
                        var lightningImage= getImage(TILES, Math.floor(items[key].lightning), 2);
                        var yOfs= random(-2, 2);
                        c.drawImage(lightningImage, 0, 0, pxTileSize, pxTileSize, px0, py0 + yOfs, px1 - px0, py1 - py0 + yOfs);
                    }
                    continue;
                }

                var w= 10, h= 10;
                if ( items[key].type == DOOR ) w= 40, h= 40; else w= 20;
                drawRect((px0 + px1) / 2, (py0 + py1) / 2, w, h, items[key].color * 40);
            }
        }
    }
}

var drawImage= function( imageIndex, imageX, imageY, imageWidth, imageHeight, x, y, width, height ) {
    var image= getImage(PLAYER, imageX, imageY, imageWidth, imageHeight);
    c.drawImage(image, 0, 0, imageWidth, imageHeight, x - imageWidth / 2, y + height / 2 - imageHeight - 2, imageWidth, imageHeight);
}

var drawPlayer= function() {
    var imageX= 0;
    var imageY= 10;
    if ( player.isMoving ) {
        imageX= Math.floor((player.pxX + player.pxY) * .3) % 8 + 1;
        if ( Math.abs(player.movementX) > Math.abs(player.movementY) ) {
            imageY= player.movementX < 0 ? 9 : 11;
        }
        else {
            imageY= player.movementY < 0 ? 8 : 10;
        }
    }

    var x= player.projX;
    if ( player.toKey in items && items[player.toKey].type == DOOR && items[player.toKey].opening == 0 ) {
        imageX= 3;
        imageY= 2;
        x += random(-4, 4);
    }

    drawImage(PLAYER, imageX, imageY, player.pxImageWidth, player.pxImageHeight, x, player.projY, player.pxWidth, player.pxHeight);
};

var drawMonsters= function() {
    for ( var i= 0; i < monsters.length; i++ ) {
        drawRect(monsters[i].projX, monsters[i].projY, 40, 10, 200);
    }
};

var drawPlayerItems= function() {
    var width= pxTileSize * 1.5;
    var height= pxTileSize * 1.5;

    // TODO: Show somewhere else if player is too near
    var x= 10;
    var dx= width + 10;

    for ( var i= 0; i < player.items.length; i++ ) {
        var inventoryImage= getImage(TILES, 2, 0, width, height);
        c.drawImage(inventoryImage, 0, 0, width, height, x, 10, width, height);
        var itemImage= getItemImage(player.items[i], width, height);
        if ( itemImage ) {
            c.drawImage(itemImage, 0, 0, width, height, x, 10, width, height);
        }
        x += dx;
    }
};

var redraw= function() {
    calcProjs();

    c.fillStyle = 'rgb(0,0,0)';
    c.fillRect(0, 0, cWidth, cHeight);

    drawMaze();
    drawPlayer();
    drawMonsters();
    drawPlayerItems();
};

var lastTimestamp;
var step= function( timestamp ) {
    if ( !lastTimestamp ) lastTimestamp= timestamp;
    var duration= timestamp - lastTimestamp;
    if ( duration >= 40 ) {

        lastTimestamp= timestamp;

        if ( DEBUG ) document.getElementById('debug').innerHTML= 1000 / duration;

        redraw();
    }
    window.requestAnimationFrame(step);
};

var resizeCanvas= function() {
    canvas.width= cWidth= window.innerWidth;
    canvas.height= cHeight= window.innerHeight;
    redraw();
};


// =============================================================================
//  Mouse
// =============================================================================

var MOUSE_CLICK_DELAY= 300;

var mousePress;
var mousePressTimestamp;

var onMouseMove= function( e ) {
    if ( e.changedTouches && e.changedTouches.length > 0 ) {
        mouseX= e.changedTouches[0].clientX;
        mouseY= e.changedTouches[0].clientY - 50;  // Offset so player is not above finger
        return;
    }
    mouseX= e.clientX;
    mouseY= e.clientY;
};

var onMouseDown= function( e ) {
    onMouseMove(e);
    mousePressTimestamp= e.timeStamp;
    player.isMoving= undefined;
}

var onMouseUp= function( e ) {
    if ( e.timeStamp - mousePressTimestamp < MOUSE_CLICK_DELAY ) {
        console.log("click", e);
        // click;
    }
    mousePressTimestamp= undefined;
    player.isMoving= undefined;
    if ( e.cancelable ) e.preventDefault();
};


// =============================================================================
//  Move player
// =============================================================================

//  1 2    walls:
//  8 4    On which sides does player collide -> Index into wallActions
//
//    1    wallActions:
//  8   2  Which position must be corrected
//    4    E.g: Walls at 2 + 4 + 8
//              ==> walls == 14
//              ==> wallAction[walls] == 12
//              ==> Correct left (8) and bottom (4)
//         wallAction for e.g. walls == 1 depend on player's heading

var wallActions= [
    [ 0, 1, 1, 1, 4, 0, 2, 3, 4, 8, 0, 9, 4, 12, 6, 0 ],        // horizontal movement
    [ 0, 8, 2, 1, 2, 0, 2, 3, 8, 8, 0, 9, 4, 12, 6, 0 ],        // vertical movement
];

var direction= 0;  // horizontal movement

var __movePlayer= function( pxX_, pxY_, result ) {

    var mazeX0= Math.floor((pxX_ - player.pxWidth / 2) / pxTileSize);
    var mazeY0= Math.floor((pxY_ - player.pxHeight / 2) / pxTileSize);
    var mazeX1= Math.floor((pxX_ + player.pxWidth / 2) / pxTileSize);
    var mazeY1= Math.floor((pxY_ + player.pxHeight / 2) / pxTileSize);

    var walls00= maze[mazeY0 + 1][mazeX0 + 1] < FLOOR ? 1 : 0;
    var walls01= maze[mazeY0 + 1][mazeX1 + 1] < FLOOR ? 2 : 0;
    var walls11= maze[mazeY1 + 1][mazeX1 + 1] < FLOOR ? 4 : 0;
    var walls10= maze[mazeY1 + 1][mazeX0 + 1] < FLOOR ? 8 : 0;

    var walls= walls00 + walls01 + walls10 + walls11;
    if ( walls ) {
        var action= wallActions[direction][walls];
        if ( action === 0 ) return;

        if ( action & 1 ) pxY_= mazeY1 * pxTileSize + player.pxHeight / 2;
        if ( action & 2 ) pxX_= mazeX0 * pxTileSize + pxTileSize - player.pxWidth / 2;
        if ( action & 4 ) pxY_= mazeY0 * pxTileSize + pxTileSize - player.pxHeight / 2;
        if ( action & 8 ) pxX_= mazeX1 * pxTileSize + player.pxWidth / 2;
    }

    result[0]= pxX_;
    result[1]= pxY_;
};

var pxDirectionPlayerX= 0;
var pxDirectionPlayerY= 0;

// Static, to reduce GCs
var _movePlayerResult= [ 0, 0 ];

var _movePlayer= function( pxX, pxY ) {
    __movePlayer(pxX, pxY, _movePlayerResult);
    var pxX_= _movePlayerResult[0];
    var pxY_= _movePlayerResult[1];

    var mazeX= Math.floor(pxX_ / pxTileSize);
    var mazeY= Math.floor(pxY_ / pxTileSize);

    // Check for item collision
    var toKey= (mazeX + 1) + ':' + (mazeY + 1);
    if ( toKey in items ) {
        if ( items[toKey].type === KEY ) {
            player.items.push(items[toKey]);
            delete items[toKey];
        }
        else if ( items[toKey].type === DOOR ) {
            if ( items[toKey].opening === 0 ) {
                var haveKey;
                for ( var i= 0; i < player.items.length; i++ ) {
                    if ( player.items[i].type === KEY && player.items[i].color === items[toKey].color ) {
                        player.items.splice(i, 1);
                        items[toKey].opening= .1;  // Start door opening animation
                        haveKey= true;
                        break;
                    }
                }
                if ( !haveKey ) {
                    player.toKey= toKey;
                    return;
                }
            }
            if ( items[toKey].opening > 0 ) {
                return;  // Wait until door is up
            }
        }
    }

    // FIXME: 150 abhaengig von Tile-Groesse?
    if ( (pxDirectionPlayerX - pxX) * (pxDirectionPlayerX - pxX) + (pxDirectionPlayerY - pxY) * (pxDirectionPlayerY - pxY) > 250 ) {
        direction= Math.abs(pxX - player.pxX) > Math.abs(pxY - player.pxY) ? 0 : 1;
        pxDirectionPlayerX= pxX;
        pxDirectionPlayerY= pxY;
    }

    player.pxX= pxX_;
    player.pxY= pxY_;
    player.toKey= toKey;

    if ( player.mazeX !== mazeX || player.mazeY !== mazeY ) {
        player.movementX= mazeX - player.mazeX;
        player.movementY= mazeY - player.mazeY;
        player.mazeX= mazeX;
        player.mazeY= mazeY;
        updateMazeFloor(calcDistances(mazeX + 1, mazeY + 1));
    }
};

var movePlayer= function( playerSpeed ) {
    if ( player.projX === undefined ) return;
    if ( mousePressTimestamp === undefined ) return;
    if ( mousePressTimestamp < MOUSE_CLICK_DELAY ) return;

    var dx= mouseX - player.projX;
    var dy= mouseY - player.projY;
    var dist= dx * dx + dy * dy;

    // Min. 20px (20^2)
    if ( dist < 400 ) {
        if ( !player.isMoving ) return;

        var view= invProj(mouseX, mouseY);

        // mouseX/mouseY may be out of range
        if ( view === undefined ) return;

        _movePlayer(view[0], view[1]);
        return;
    }

    player.isMoving= true;

    var alpha= Math.atan2(dx, dy);
    _movePlayer(player.pxX + Math.sin(alpha) * cWidth * playerSpeed,
                player.pxY + Math.cos(alpha) * cHeight * playerSpeed);
};


// =============================================================================
//  Move monsters
// =============================================================================

var targetSpider= function( monster, mazeX, mazeY ) {
    var mazeX_;
    var mazeY_;

    if ( monster.steps.length == 0 ) {
        mazeX_= mazeX;
        mazeY_= mazeY;
        var content_= maze[mazeY_ + 1][mazeX_ + 1];
        var toPlayer= random(0, 4);
        var stepCount= random(1, 7);
        for ( var step= 0; step < stepCount; step++ ) {
            var dir= random(0, 4);
            for ( var i= 0; i < 4; i++ ) {
                var mazeX__= mazeX_ + dirs[dir][0];
                var mazeY__= mazeY_ + dirs[dir][1];
                var content__= maze[mazeY__ + 1][mazeX__ + 1];
                if ( content__ >= FLOOR && ((toPlayer > 0 && content__ < content_) || (toPlayer === 0 && content__ > content_)) ) {
                    mazeX_= mazeX__;
                    mazeY_= mazeY__;
                    content_= content__;
                    monster.steps.push([ mazeX_, mazeY_ ]);
                    break;
                }
                dir= (dir + 1) & 3;
            }
            if ( i >= 4 ) break;  // Give up
        }
    }

    if ( monster.steps.length ) {
        var pos= monster.steps.shift();
        mazeX_= pos[0];
        mazeY_= pos[1];

        if ( mazeX_ !== mazeX || mazeY_ !== mazeY ) {
            monster.targetX= (mazeX_ + .5 + randomf(-.2, .2)) * pxTileSize;
            monster.targetY= (mazeY_ + .5 + randomf(-.3, .3)) * pxTileSize;
            monster.atTarget= 3;
        }
    }
};

var moveMonster= function( monster, monsterSpeed ) {

// console.log(monster);

    if ( monster.atTarget === 0 ) {
        var mazeX= Math.floor(monster.x / pxTileSize);
        var mazeY= Math.floor(monster.y / pxTileSize);
        if ( monster.type === SPIDER ) {
            return targetSpider(monster, mazeX, mazeY);
        }
        return;
    }

    var alpha= Math.atan2(monster.targetX - monster.x, monster.targetY - monster.y);

    if ( monster.atTarget & 1 ) {
        var dx= Math.sin(alpha) * cWidth * monsterSpeed;
        if ( Math.abs(monster.x + dx - monster.targetX) <= dx ) {
            monster.x= monster.targetX;
            monster.atTarget &= ~1;
        }
        else {
            monster.x += dx;
        }
    }
    if ( monster.atTarget & 2 ) {
        var dy= Math.cos(alpha) * cHeight * monsterSpeed;
        if ( Math.abs(monster.y + dy - monster.targetY) <= dy ) {
            monster.y= monster.targetY;
            monster.atTarget &= ~2;
        }
        else {
            monster.y += dy;
        }
    }
};

var moveMonsters= function( monsterSpeed ) {
    for ( var i= 0; i < monsters.length; i++ ) {
        moveMonster(monsters[i], monsterSpeed);
    }
};

var moveItems= function( itemSpeed ) {
    for ( var key in items ) {
        var item= items[key];
        if ( item.type === DOOR ) {
            if ( item.opening > 0 ) {
                item.opening += itemSpeed;
                if ( item.opening >= 7 ) item.opening= -1;
            }
            item.lightning += itemSpeed;
            if ( item.lightning >= 5 ) item.lightning -= 5;
        }
    }
};


// =============================================================================
//  Game Logic
// =============================================================================

var TICKS_PER_SECOND= 20;

var gameLogic= function() {
    moveItems(TICKS_PER_SECOND / 80);
    movePlayer(TICKS_PER_SECOND / 3000);
    moveMonsters(TICKS_PER_SECOND / 10000);
};


// =============================================================================
//  Init
// =============================================================================

var init= function() {

    genMaze();

    canvas= document.getElementById('stage');
    c= canvas.getContext('2d');

    window.addEventListener('resize', resizeCanvas, false);
    resizeCanvas();

    window.addEventListener('touchstart', onMouseDown, false);
    window.addEventListener('mousedown', onMouseDown, false);
    window.addEventListener('touchmove', onMouseMove, false);
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('touchend', onMouseUp, false);
    window.addEventListener('mouseup', onMouseUp, false);

    window.requestAnimationFrame(step);
    setInterval(gameLogic, TICKS_PER_SECOND);
};

window.addEventListener('load', function() {
    loadSprites(init);
});

})();
