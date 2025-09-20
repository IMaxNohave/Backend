#!/bin/bash
set -e

echo "---------------------------------------------"
echo "Setting up MySQL database: $MYSQL_DB"
echo "Creating application user: $MYSQL_APP_USER"
echo "---------------------------------------------"

mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL
    CREATE DATABASE IF NOT EXISTS \`$MYSQL_DB\`;
    CREATE USER IF NOT EXISTS '$MYSQL_APP_USER'@'%' IDENTIFIED BY '$MYSQL_APP_PASSWORD';
    GRANT ALL PRIVILEGES ON \`$MYSQL_DB\`.* TO '$MYSQL_APP_USER'@'%';
    FLUSH PRIVILEGES;
EOSQL
