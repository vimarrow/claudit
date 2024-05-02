use std::{
    fs,
    io::{Read, Write},
    os::unix::net::{UnixListener, UnixStream},
    path::Path,
    str,
    thread::{self}
};

fn get_tree(db: &sled::Db, tree_vec: &mut Vec<Option<sled::Tree>>, raw_index: u8) -> Option<sled::Tree> {
    let index = usize::from(raw_index);
    if tree_vec[index].is_none() {
        let new_tree = match db.open_tree(&[raw_index]) {
            Ok(db) => db,
            Err(err) => {
                println!("Error on db tree select.");
                println!("{:?}", err);
                return None;
            }
        };
        tree_vec[index] = Some(new_tree.clone());
        return Some(new_tree);
    }
    return tree_vec[index].clone();
}

fn concatenate_merge(
  _key: &[u8],               // the key being merged
  old_value: Option<&[u8]>,  // the previous value, if one existed
  merged_bytes: &[u8]        // the new bytes being merged in
) -> Option<Vec<u8>> {       // set the new value, return None to delete
  let mut ret = old_value
    .map(|ov| ov.to_vec())
    .unwrap_or_else(|| vec![]);

  ret.extend_from_slice(merged_bytes);

  Some(ret)
}

fn handle_connection(mut stream: UnixStream) {
    let mut db_name_buf: [u8; 255] = [0; 255];
    let count = match stream.read(&mut db_name_buf) {
        Ok(size) => size,
        Err(err) => {
            println!("Error on db name read.");
            println!("{:?}", err);
            return;
        }
    };
    if count < 3 {
        println!("No db name provided.");
        return;
    }
    let db_full_path = match str::from_utf8(&db_name_buf[0..count]) {
        Ok(r) => r,
        Err(err) => {
            println!("Error on db name decode.");
            println!("{:?}", err);
            return;
        }
    };
    let db = match sled::open(db_full_path) {
        Ok(t) => t.to_owned(),
        Err(err) => {
            println!("Error on sled file read.");
            println!("{:?}", err);
            return;
        }
    };
    println!("Open db: {:?}", db_full_path);
    let mut tree_vec: Vec<Option<sled::Tree>> = (0..255).map(|_| None).collect();
    let tree_res = get_tree(&db, &mut tree_vec, 1);
    if tree_res.is_none() {
        println!("FIRST Error on getting the proper tree.");
    }
    let mut did_write = false;
    let mut incomming_size: u32 = 0;
    let mut cmd = 0;
    let mut tree = tree_res.unwrap(); 
    let mut key: Vec<u8> = vec![0];

    loop {
        let mut buf: [u8; 2048] = [0; 2048]; //1048576
        let count = match stream.read(&mut buf) {
            Ok(size) => size,
            Err(err) => {
                println!("Error on stream read.");
                println!("{:?}", err);
                break;
            }
        };
        if count < 1 {
            break;
        }
        if incomming_size == 0 {
            cmd = buf[0];
            let ver = buf[1];
            let tree_bit = buf[2];
            let size_but_for_display_only = u32::from_be_bytes([0, buf[3], buf[4], buf[5]]);
            key = buf[6..22].to_vec();
            println!("\n=== NEW PACKET HEADER ===");
            println!("CMD: {:?}", cmd);
            println!("VER: {:?}", ver);
            println!("TRE: {:?}", tree_bit);
            println!("SIZ: {:?}", size_but_for_display_only);
            println!("UID: {:?}", key.as_slice());
            println!("=== END PACKET HEADER ===");
            tree = get_tree(&db, &mut tree_vec, tree_bit).unwrap();
            tree.set_merge_operator(concatenate_merge);
        } else {
            print!(".");
        }
        match cmd {
            // NOOP
            0 => {},
            // SELECT ???
            1 => {},
            // GET
            2 => {
                let db_res = tree.get(key.as_slice());
                match db_res {
                    Ok(val) => {
                        match val {
                            Some(arr) => {
                                stream.write_all(&arr).unwrap();
                            },
                            None => {
                                // println!("Got none.");
                                stream.write_all(&[0]).unwrap();
                            }
                        }
                    },
                    Err(err) => {
                        stream.write_all(&[0]).unwrap();
                        println!("Error on db get.");
                        println!("{:?}", err);
                    }
                }
            },
            // SET
            3 => {
                if incomming_size == 0 {
                    incomming_size = u32::from_be_bytes([0, buf[3], buf[4], buf[5]]) + 22;
                    let db_res = tree.insert(key.as_slice(), &buf[22..count]);
                    match db_res {
                        Ok(_) => { did_write = true; },
                        Err(err) => {
                            stream.write_all(&[0]).unwrap();
                            println!("Error on db set.");
                            println!("{:?}", err);
                        }
                    }
                } else {
                    let db_res = tree.merge(key.as_slice(), &buf[0..count]);
                    match db_res {
                        Ok(_) => { },
                        Err(err) => {
                            stream.write_all(&[0]).unwrap();
                            println!("Error on db set.");
                            println!("{:?}", err);
                        }
                    }
                }
                if count >= incomming_size as usize {
                    incomming_size = 0;
                } else {
                    incomming_size = incomming_size - count as u32;
                }
            },
            // DEL
            4 => {
                did_write = true;
                let db_res = tree.remove(key.as_slice());
                match db_res {
                    Ok(_) => {},
                    Err(err) => {
                        stream.write_all(&[0]).unwrap();
                        println!("Error on db set.");
                        println!("{:?}", err);
                    }
                }
            },
            // SAVE
            5 => {
                match tree.flush() {
                    Ok(us) => {
                        println!("Wrote {:} bytes on disk", us);
                    },
                    Err(err) => {
                        println!("Error on db flush");
                        println!("{:?}", err);
                    },
                };
                did_write = false;
            }
            _ => {},
        }
    }
    if did_write {
        match db.flush() {
            Ok(us) => {
                println!("Wrote {:} bytes on disk", us);
            },
            Err(err) => {
                println!("Error on db flush");
                println!("{:?}", err);
            },
        };
    }
    println!("One connection closed!");
}

fn main() {
    let socket_file = Path::new("/tmp/myoga.claudit.sock");

    if socket_file.exists() {
        fs::remove_file(&socket_file).unwrap();
    }

    let listener = match UnixListener::bind(&socket_file) {
        Err(_) => panic!("failed to bind to socket"),
        Ok(l) => l,
    };

    println!("Myoga started, ready for clients.");

    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                thread::spawn(move || handle_connection(s));
            }
            Err(err) => {
                println!("Error on stream unwrapping.");
                println!("{:?}", err);
            }
        }
    }
}
