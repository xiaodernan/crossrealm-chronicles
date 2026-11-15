FROM eclipse-temurin:21-jre
COPY notification-service/target/notification-service-0.1.0-SNAPSHOT.jar /app/app.jar
EXPOSE 8085
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
