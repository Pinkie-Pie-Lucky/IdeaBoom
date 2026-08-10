# 备选部署方案：魔搭若切换为 Docker SDK 时使用
# 构建：docker build -t ideaboom .
# 运行：docker run -p 7860:7860 -e VC_LLM_API_KEY=xxx ideaboom
FROM node:22-alpine

WORKDIR /app

COPY package.json server.js ./
COPY public ./public
COPY src ./src

# 魔搭/容器平台通常暴露 7860 端口
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]
