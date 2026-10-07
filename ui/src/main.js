import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { useGithubSessionStore } from './stores/githubSession'
import { useToast } from './composables/useToast'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// Coming back from GitHub's sign-in page: finish it and return to where the person was.
useGithubSessionStore().completeLogin().then((done) => {
  if (!done) return
  router.replace(done.returnHash.replace(/^#/, '') || '/workspace')
  const toast = useToast()
  if (done.ok) toast.show(`Signed in to GitHub as ${done.login}.`, { tone: 'success' })
  else toast.show(done.message, { tone: 'error' })
})
