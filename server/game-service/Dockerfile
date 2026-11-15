FROM eclipse-temurin:21-jre
COPY game-service/target/game-service-0.1.0-SNAPSHOT.jar /app/app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
