import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/r/:code', component: () => import('./views/Room.vue'), props: true },
    { path: '/screen/:code', component: () => import('./views/Screen.vue'), props: true },
    { path: '/recap/:id', component: () => import('./views/Recap.vue'), props: true },
    { path: '/q/:id', component: () => import('./views/QuestionPage.vue'), props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
