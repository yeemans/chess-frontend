let board = document.querySelector("#board"); 
// create a function that returns a piece when its square is clicked 
let clickedPiece; 
let turn = 1;
let moveHistory = [];
let gameID = 0;

let colorToMove = "white";
let playerColor = setPlayerColor();
let gameStarted = false;


async function createRoom() { 
    let url = await fetch("https://chess-api-production.up.railway.app/room/create"); 
    let json = await url.json(); 
    await setGameID(json);
    await console.log(json); 
    await createWebsocketConnection(json["game_id"]);
    await setPlayerColor("white");
}

function setPlayerColor() { 
    let url = window.location.href; 
    let color = "white"; 
    if (url.includes("?id")) color = "black";
    return color;
}

function getGameId() { 
    document.getElementById("roomInput").classList.remove("hidden");
}

function setJoinGameLink() { 
    let link = document.getElementById("joinGameLink"); 
    let id = document.getElementById("roomId").value;
    link.href = `?id=${id}`;
}

function joinGame() { 
    let url = window.location.href; 
    const params = new URLSearchParams(window.location.search);

    // check if url has room id param
    if (url.includes("?id")) { 
        gameID = +params.get("id");
        createWebsocketConnection(gameID);
        gameStarted = true;
        playChess(turn);
        // show opponent's first move, if applicable 
        getOpponentsFirstMove();
        document.getElementById("status").classList.remove("hidden");
    }
}

async function getOpponentsFirstMove() { 
    let url = await fetch(`https://chess-api-production.up.railway.app/${gameID}/moves`); 
    let json = await url.json(); 

    await showOpponentsFirstMove(json);
}

function showOpponentsFirstMove(json) { 
    if (json.length == 0) return;
    let lastMove = json[json.length - 1]; 
    let piece = getPieceOnSquare(lastMove["start"]);  
    if (piece) movePiece(gameID, piece, lastMove["end"]);
}

function createWebsocketConnection(gameRoomId) {
    const webSocketUrl = 'wss://chess-api-production.up.railway.app/cable';
    socket = new WebSocket(webSocketUrl);
     
    // connect to the room channel
    socket.onopen = function(event) {
        let joining = false;

        console.log('WebSocket is connected.');
        let room = {
            command: 'subscribe',
            identifier: JSON.stringify({
                game_id: gameRoomId,
                channel: 'RoomsChannel', 
            }),
        };
        socket.send(JSON.stringify(room));

        // if joining the room, send a message telling the host that room is joined
        if (window.location.href.includes("?id")) {
            fetch('https://chess-api-production.up.railway.app/update_room_status', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ "room_id": gameRoomId})
            })
        }
    };
    
    // When the connection is closed, this code will run.
    socket.onclose = function(event) {
        console.log('WebSocket is closed.');
    };
    // When a message is received through the websocket, this code will run.
    socket.onmessage = function(event) {           
        const response = event.data;
        const move = JSON.parse(response);
        if (move.type === "ping") return; 
        
        // move is in the move["message"] hash
        if (move["message"] == "joined") { 
            gameStarted = true;
            playChess(turn);
        }
        if (!gameStarted) return;
        updateTurnText();
        // if the message is a move
        if (move["message"] && move["message"].hasOwnProperty("start")) { 
            let piece = getPieceOnSquare(move["message"]["start"]);
            if (!piece) return; 
            movePiece(gameID, piece, move["message"]["end"]);
            setColorToMove(piece);
        }
        console.log(move)
    };
    
    socket.onerror = function(error) {
        console.log('WebSocket Error: ' + error);
    };
} 

function setGameID(json) { 
    gameID = json["game_id"];
    let idText = document.getElementById("IDtext"); 
    let status = document.getElementById("status"); 

    idText.classList.remove("hidden");
    idText.innerText = `Give this ID to your friend: ${gameID}`;
    status.classList.remove("hidden");
}

function updateTurnText() { 
    let turnText = "Opponent's turn."
    let status = document.getElementById("status")
    if (colorToMove == playerColor) turnText = "Your turn."
    status.innerText = turnText; 
    document.title = turnText;

    if (handleStaleMate(turn))  
        status.innerText = "Stalemate."
    if (handleCheckMate(turn)) {
        let winner = handleCheckMate(turn);
        status.innerText = `${winner} wins.`;
    }
    if (threeFoldRepetition(turn)) { 
        status.innerText = "Draw by repetitition";
    }
    
}

async function receiveMoves(gameID) { 
    let moves = await fetch(`https://chess-api-production.up.railway.app/${gameID}/moves`);
    let json = await moves.json(); 

    await console.log(json);
}

function addColor(square, index) { 
    let topRow = [0, 1, 0, 1, 0, 1, 0, 1]; // light is 0, dark is 1
    let secondRow = [1, 0, 1, 0, 1, 0, 1, 0];
    let currentRow = parseInt(index / 8);
    let squareInRow = index % 8;
    let colors = ["light", "dark"];
    if (currentRow % 2 == 0) square.classList.add( colors[topRow[squareInRow]] );
    if (currentRow % 2 == 1) square.classList.add( colors[secondRow[squareInRow]] );
}

function drawBoard() {
    for (let i = 0; i < 64; i++) { 
        let square = document.createElement("div"); 
        square.id = `square-${i}`; 
        square.classList.add("square");
        addColor(square, i);
        board.appendChild(square);
    }
}

function showPieces() { 
    for (let piece of allPieces) { 
        document.querySelector(`#square-${piece.square}`).innerHTML = getPieceHTML(piece);
    }
}

function isInCheck(king) { 
    let enemyPieces = [];
    if (king.color == "white") enemyPieces = getBlackPieces(); 
    if (king.color == "black") enemyPieces = getWhitePieces(); 
    for (let piece of enemyPieces) { 
        if (piece.moves.includes(king.square)) return true;
    }
    return false;
}

function getKing(color) { 
    for (let i = 0; i < allPieces.length; i++) { 
        let piece = allPieces[i];
        if (piece.color == color && piece.char == "♔") return piece;
    }
}

function addClickListener(pieces) {
    if (!gameStarted) return; 

    for (let piece of pieces) { 
        square = document.querySelector(`#square-${piece.square}`); 
        square.addEventListener('click', function() { 
            getClickedPiece(piece);
        });
    } 
}

function makeSameColorPiecesClickable(piece) { 
    let pieces = getSameColorPieces(piece); 
    addClickListener(pieces);
}

function getClickedPiece(piece) { 
    clickedPiece = piece;
    // remove event listeners for other pieces, so you can capture them 
    document.body.outerHTML = document.body.outerHTML;
    // since all event listeners are removed, we need to make our same-color pieces clickable
    makeSameColorPiecesClickable(piece);
    showMoves(piece);
}

function calculateMoves(pieces) { 
    for (let piece of pieces) { 
        piece.moves = []; 
        piece.getMoves() ;
    }
}

function showMoves(piece) { 
    let square;
    unHighlightBoard();
    for (let move of piece.moves) { 
        square = document.querySelector(`#square-${move}`);
        square.classList.add("highlighted");
        square.addEventListener('click', function() { 
            movePiece(gameID, clickedPiece, move);
        })
    }
}

function getMoveFromSquareNode(node) { 
    console.log(node);
    return +node.id.slice(7);
}

function unHighlightBoard() { 
    let square;
    for (let i = 0; i < 64; i++) {
        square = document.querySelector(`#square-${i}`);
        square.classList = "square"; // take out light and dark classes, will resassign
        addColor(square, i);
    }
}

function setUpNextMove() { 
    // remove all event listeners 
    document.body.outerHTML = document.body.outerHTML;
    unHighlightBoard();
    turn += 1;
    playChess(turn);
}

function updateMoveHistory(piece, move) { 
    moveHistory.push( {
        pieceType: piece.char, 
        start: piece.square, 
        end: move
    } );
}

function deleteInvalidMoves(piece, invalidMoves) { 
    for (let move of invalidMoves) { 
        piece.moves = piece.moves.filter(function(m) { 
            return m != move;
        })
    }
}

function filterMoves(colorPieces) { 
    // loop through each move of each piece
    // test move it on the board 
    // see if king is in check
    let king = getKing(colorPieces[0].color);
    let allPiecesCopy = [...allPieces]; // used to restore board after move test

    for (let piece of colorPieces) { 
        let originalSquare = piece.square; 
        let invalidMoves = [];
        let moveIndex = 0;

        for (let move of piece.moves) {
            allPieces = allPiecesCopy;

            testMove(piece, move);
            calculateMoves(getOtherColorPieces(piece)); 
            if (isInCheck(king)) invalidMoves.push(move);

            testMove(piece, originalSquare); // move piece back
            moveIndex += 1
        }
        deleteInvalidMoves(piece, invalidMoves);
    }
    allPieces = allPiecesCopy;
}

function testMove(piece, move) { 
    if (piece.color == "white") enemyPieces = getBlackPieces(); 
    if (piece.color == "black") enemyPieces = getWhitePieces();
    let oldSquare = piece.square; 
    // make the old square blank
    document.querySelector(`#square-${oldSquare}`).innerHTML = ""; 
    // check if piece is capturing 
    if (hitPiece(move)) { 
        allPieces = allPieces.filter(function (piece) { 
            // take the captured piece out of allPieces array
            return piece != getPieceOnSquare(move);
        }); 
    }
        
    piece.square = move;
    document.querySelector(`#square-${move}`).innerHTML = getPieceHTML(piece);
    showPieces();
}


function piecesCanMove(color) { 
    let pieces;
    let canMove = false;

    if (turn % 2 == 1) pieces = getWhitePieces();
    if (turn % 2 == 0) pieces = getBlackPieces(); 

    for (let piece of pieces) { 
        if (piece.moves.length > 0) canMove = true; // not in checkmate
    }
    return canMove;
}

function handleCheckMate(turn) { 
    let color;
    let otherColorPieces; 

    if (turn % 2 == 1) color = "white";
    if (turn % 2 == 0) color = "black";

    if (color == "white") otherColorPieces = getBlackPieces(); 
    if (color == "black") otherColorPieces = getWhitePieces();
    calculateMoves(otherColorPieces);

    if ( !piecesCanMove(color) && isInCheck(getKing(color)) ) { 
        let winner = otherColorPieces[0].color;
        return winner;
    }

    return false;
}

function handleStaleMate(turn) { 
    let color;
    let otherColorPieces; 

    if (turn % 2 == 1) color = "white";
    if (turn % 2 == 0) color = "black";

    if (color == "white") otherColorPieces = getBlackPieces(); 
    if (color == "black") otherColorPieces = getWhitePieces();
    calculateMoves(otherColorPieces);

    if ( !piecesCanMove(color) && !isInCheck(getKing(color)) ) { 
        return true;
    }

    return false;
}

function getLastFiveMoves(color) { 
    if (color == "white") { 
        let moves = moveHistory.filter( (element, index) => { 
            return index % 2 == 0;
        })
        return moves.slice(moves.length - 5, moves.length);
    }
 
    let moves = moveHistory.filter( (element, index) => { 
        return index % 2 == 1;
    })
    return moves.slice(moves.length - 5, moves.length);
    
}

function threeFoldRepetition() { 
    if (moveHistory.length < 10) return; // min. length for a threefold draw;
    let whiteMoves = getLastFiveMoves("white");
    let blackMoves = getLastFiveMoves("black");
    // check for the repetition 
    for (let i = 1; i < whiteMoves.length; i++) { 
        let whiteMove = whiteMoves[i];
        let lastWhiteMove = whiteMoves[i - 1];
        if (whiteMove.start != lastWhiteMove.end || 
            whiteMove.end != lastWhiteMove.start) return;

        let blackMove = blackMoves[i]; 
        let lastBlackMove = blackMoves[i - 1]; 
        if (blackMove.start != lastBlackMove.end || 
            blackMove.end != lastBlackMove.start) return;
    }
    return true;
}

drawBoard();

let allPieces = [];
// setting up pawns 
function setPawns() {
    for (let i = 0; i < 8; i++) { 
        let blackRowStart = 8
        let whiteRowEnd = 55;
        let whitePawn = new Pawn("white", whiteRowEnd - i); 
        let blackPawn = new Pawn("black", i + blackRowStart);
        allPieces.push(whitePawn, blackPawn);
    }
}

function setPieces() { 
    const DISTANCE = 56;
    for (let rookSquare of [56, 63]) {
        allPieces.push(new Rook("white", rookSquare)); 
        allPieces.push(new Rook("black", rookSquare - DISTANCE));
    }

    for (let knightSquare of [57, 62]) { 
        allPieces.push(new Knight("white", knightSquare));
        allPieces.push(new Knight("black", knightSquare - DISTANCE));
    }

    for (let bishopSquare of [58, 61]) { 
        allPieces.push(new Bishop("white", bishopSquare));
        allPieces.push(new Bishop("black", bishopSquare - DISTANCE));
    }

    allPieces.push(new Queen("white", 59)); 
    allPieces.push(new King("white", 60));

    allPieces.push(new Queen("black", 3)); 
    allPieces.push(new King("black", 4));
}

function putPiecesOnSquares() { 
    for (let piece of allPieces) { putPiece(piece, piece.square) };
}

function playChess(turn) { 
    let whitePieces = getWhitePieces();
    let blackPieces = getBlackPieces();
    if (threeFoldRepetition()) return true;

    if (turn % 2 == 1) { 
        calculateMoves(blackPieces); //calculate opposite color moves first 
        calculateMoves(whitePieces);
        filterMoves(whitePieces);
        if (playerColor == "white") addClickListener(whitePieces);
    }

    if (turn % 2 == 0) { 
        calculateMoves(whitePieces); //calculate opposite color moves first 
        calculateMoves(blackPieces);
        filterMoves(blackPieces);
        if (playerColor == "black") addClickListener(blackPieces);
    }   
    handleCheckMate(turn);
    handleStaleMate(turn);
    showPieces();
}

setPawns();
setPieces(); 
putPiecesOnSquares();




