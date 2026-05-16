FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Storage.Api.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
VOLUME ["/data/storage"]
EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000
ENV Storage__Path=/data/storage
ENTRYPOINT ["dotnet", "Storage.Api.dll"]
