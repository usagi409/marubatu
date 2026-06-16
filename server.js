const express = require('express');
const app = express();
const http = require('http').createServer(app);

// ⭕ 外（ローカルファイル）からの接続を許可する設定を追加
const io = require('socket.io')(http, {
    cors: {
        origin: "*"
    }
});

app.use(express.static('public'));

const rooms = {};

function checkWinner(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return board.includes(null) ? null : 'draw';
}

io.on('connection', (socket) => {
    // 部屋作成（重複チェック付き）
    socket.on('create-room', ({ userName }) => {
        let roomId;
        do {
            roomId = Math.floor(1000 + Math.random() * 9000).toString();
        } while (rooms[roomId]); 

        rooms[roomId] = { 
            players: [{id: socket.id, name: userName, role: 'X'}], 
            board: Array(9).fill(null), 
            status: 'waiting' 
        };
        socket.join(roomId);
        socket.emit('room-created', { roomId, role: 'X' });
    });

    socket.on('join-room', ({ roomId, userName }) => {
        const room = rooms[roomId];
        if (!room || room.players.length >= 2) return socket.emit('error', '部屋が見つかりません');
        
        room.players.push({id: socket.id, name: userName, role: 'O'});
        socket.join(roomId);
        socket.emit('joined', { roomId, role: 'O' });
        
        io.to(roomId).emit('status', '3秒後に開始します...');
        let count = 3;
        const timer = setInterval(() => {
            io.to(roomId).emit('status', count);
            if (--count < 0) {
                clearInterval(timer);
                room.status = 'playing';
                io.to(roomId).emit('game-start', { board: room.board, players: room.players, turn: 'X' });
            }
        }, 1000);
    });

    socket.on('move', ({ roomId, index }) => {
        const room = rooms[roomId];
        if (room && room.status === 'playing' && room.board[index] === null) {
            const currentTurn = room.board.filter(x => x).length % 2 === 0 ? 'X' : 'O';
            const player = room.players.find(p => p.id === socket.id);
            
            if (player && player.role === currentTurn) {
                room.board[index] = player.role;
                const winner = checkWinner(room.board);
                
                if (winner) {
                    room.status = 'finished';
                    const winnerPlayer = room.players.find(p => p.role === winner);
                    const winnerName = winner === 'draw' ? '引き分け' : (winnerPlayer ? winnerPlayer.name : winner);
                    io.to(roomId).emit('win', { winnerName });
                } else {
                    io.to(roomId).emit('update', { board: room.board, turn: currentTurn === 'X' ? 'O' : 'X', players: room.players });
                }
            }
        }
    });
});

http.listen(process.env.PORT || 3000);
