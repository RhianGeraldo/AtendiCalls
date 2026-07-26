package main

import (
	"database/sql"
	"fmt"
	_ "github.com/mattn/go-sqlite3"
)

func main() {
	db, err := sql.Open("sqlite3", "../atendicalls.db")
	if err != nil {
		fmt.Println(err)
		return
	}
	defer db.Close()
	_, err = db.Exec("UPDATE users SET email = 'admin@admin.com' WHERE email = 'admin@atendicalls.com'")
	if err != nil {
		fmt.Println(err)
	} else {
		fmt.Println("Email updated successfully")
	}
}
