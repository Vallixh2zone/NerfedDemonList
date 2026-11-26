import Home from './pages/Home.js';
import List from './pages/List.js';
import Leaderboard from './pages/Leaderboard.js';
import Roulette from './pages/Roulette.js';
import Wheel from './pages/Wheel.js';
import Submit from './pages/Submit.js';
import Review from './pages/Review.js';
import Account from './pages/Account.js';

export default [
    { path: '/', component: Home },
    { path: '/list', component: List },
    { path: '/leaderboard', component: Leaderboard },
    { path: '/roulette', component: Roulette },
    { path: '/wheel', component: Wheel },
    { path: '/submit', component: Submit },
    { path: '/review', component: Review },
    { path: '/account', component: Account },
];
