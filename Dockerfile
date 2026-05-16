FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY web/package.json ./web/package.json
RUN npm --prefix web install
COPY web ./web
RUN npm --prefix web run build

FROM nginx:1.27-alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
