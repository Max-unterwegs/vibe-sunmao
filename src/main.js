import { Museum } from './game/museum.js';

const canvas = document.getElementById('scene');
const museum = new Museum(canvas);
window.__museum = museum;

museum.boot().catch((err) => {
  console.error('[榫卯] 启动失败', err);
  const loader = document.getElementById('loaderText');
  if (loader) loader.textContent = '展厅启动失败，请查看控制台';
});
