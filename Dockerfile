# -------- FRONTEND BUILD --------
FROM node:20 AS frontend
WORKDIR /app
COPY src/frontend/bribery-game-client/ .
RUN npm install
RUN npm run build


# -------- BACKEND BUILD --------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /app
COPY src/backend/ .
RUN dotnet publish BriberyGame.Api/BriberyGame.Api.csproj -c Release -o /out


# -------- FINAL RUNTIME --------
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app

COPY --from=backend /out .

COPY --from=frontend /app/dist/bribery-game-client/browser /app/wwwroot

ENV ASPNETCORE_URLS=http://+:80

ENTRYPOINT ["dotnet", "BriberyGame.Api.dll"]