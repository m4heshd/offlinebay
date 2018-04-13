$(document).ready(function () {

    /* Search bar animations
    ----------------------------*/
    $(".top-search__input").on("focus", function () {
        $(".top-search").addClass("top-search--focused");
    }).on("blur", function () {
        let a = $(this).val();
        !a.length > 0 && $(".top-search").removeClass("top-search--focused");
    });
    $(".top-search").on("click", ".top-search__reset", function () {
        $(".top-search").removeClass("top-search--focused");
        $(".top-search__input").val("");
    });

    /* Menu dropdown animations
    ----------------------------*/
    $('.dropdown').on('show.bs.dropdown', function () {
        $(this).find('.dropdown-menu').first().stop(true, true).css({
            opacity: 1,
            transition: 'opacity 0.2s'
        }).slideDown(200);
    }).on('hide.bs.dropdown', function () {
        $(this).find('.dropdown-menu').first().stop(true, true).css({
            opacity: 0,
            transition: 'opacity 0.2s'
        }).slideUp(200);
    });

    /* Data table functions
    ----------------------------*/
    $("#tblMainBody").on('click', 'tr', function () {
        if (!$(this).hasClass('active')) {
            $('#tblMain .active').removeClass('active');
            $(this).addClass('active');
        }
    });
    // let $table = $('#tblMain');
    // $table.floatThead({
    //     zIndex: 1
    // });

    // /* Filtering
    // ----------------------------*/
    // $("#txtFilter").keyup(function () {
    //     filterTbl();
    // });
    //
    // function filterTbl() {
    //
    //     let input, filter, table, tr, td, i, smart;
    //     input = document.getElementById("txtFilter");
    //     filter = input.value.toUpperCase();
    //     table = document.getElementById("tblMain");
    //     tr = table.getElementsByTagName("tr");
    //     smart = $('#chkSmartSearch').prop('checked');
    //
    //     if (smart) {
    //         filter = input.value;
    //         let reg = new RegExp(regexify(filter), 'i');
    //         for (i = 0; i < tr.length; i++) {
    //             td = tr[i].getElementsByTagName("td")[2];
    //             if (td) {
    //                 if (td.innerHTML.match(reg)) {
    //                     tr[i].style.display = "";
    //                 } else {
    //                     tr[i].style.display = "none";
    //                 }
    //             }
    //         }
    //     } else {
    //         for (i = 0; i < tr.length; i++) {
    //             td = tr[i].getElementsByTagName("td")[2];
    //             if (td) {
    //                 if (td.innerHTML.toUpperCase().indexOf(filter) > -1) {
    //                     tr[i].style.display = "";
    //                 } else {
    //                     tr[i].style.display = "none";
    //                 }
    //             }
    //         }
    //     }
    //
    // }
    //
    // function escapeRegExp(text) {
    //     return text.replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&');
    // }
    //
    // function regexify(text) {
    //     text = text.trim().replace(/(\s+)/g, ' ');
    //     let words = text.split(' ');
    //     let final = '';
    //     words.forEach(function (item) {
    //         final += '(?=.*' + escapeRegExp(item) + ')';
    //     });
    //     return final;
    // }

});